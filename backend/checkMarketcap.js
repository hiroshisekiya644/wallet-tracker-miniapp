const fs = require('fs').promises;
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
require('dotenv').config();

const prisma = new PrismaClient();
const TOKENS_FILE = path.join(__dirname, 'jsons', 'created_tokens.json');
const TEMP_FILE = path.join(__dirname, 'jsons', 'temp_tokens.json');
const BITQUERY_API_KEY = process.env.BITQUERY_API_KEY;

async function getPriceInUSD(mintAddress) {
    const query = `{
        Solana {
            DEXTradeByTokens(
                limit: {count: 1}
                orderBy: {descending: Block_Time}
                where: {
                    Trade: {
                        Currency: {MintAddress: {is: "${mintAddress}"}}, 
                        Dex: {ProgramAddress: {is: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"}}
                    }, 
                    Transaction: {Result: {Success: true}}
                }
            ) {
                Trade {
                    PriceInUSD
                }
            }
        }
    }`;

    try {
        const response = await axios.post(
            'https://streaming.bitquery.io/eap',
            { query },
            {
                headers: {
                    'Authorization': `Bearer ${BITQUERY_API_KEY}`
                }
            }
        );

        const trades = response.data?.data?.Solana?.DEXTradeByTokens || [];
        
        if (trades.length === 0) {
            return null;
        }

        return parseFloat(trades[0]?.Trade?.PriceInUSD || 0);
    } catch (error) {
        console.error(`Error fetching price for ${mintAddress}:`, error.response?.data || error.message);
        return null;
    }
}

async function moveTokensToTemp() {
    try {
        // Read current tokens
        const data = await fs.readFile(TOKENS_FILE, 'utf8');
        const tokens = JSON.parse(data);
        
        // Write to temp file
        await fs.writeFile(TEMP_FILE, JSON.stringify(tokens, null, 2));
        
        // Clear original file
        await fs.writeFile(TOKENS_FILE, JSON.stringify([], null, 2));
        
        return tokens;
    } catch (error) {
        console.error('Error moving tokens to temp file:', error);
        return [];
    }
}

async function saveTokenToDB(token, price) {
    try {
        await prisma.token.create({
            data: {
                ...token
            }
        });
        console.log(`Token ${token.mintAddress} saved to DB with price ${price}`);
    } catch (error) {
        console.error(`Error saving token to DB:`, error);
    }
}

async function saveRemainingTokens(tokensToKeep) {
    if (tokensToKeep.length < 1) {
        console.log('No data from processing');
        try {
            await fs.unlink(TEMP_FILE);
        } catch (error) {
            // Ignore if temp file doesn't exist
        }
        return;
    }
    try {
        // Read current tokens from file
        let currentTokens = [];
        try {
            const data = await fs.readFile(TOKENS_FILE, 'utf8');
            currentTokens = JSON.parse(data);
        } catch (error) {
            // If file doesn't exist or is empty, use empty array
            currentTokens = [];
        }

        // Combine current tokens with tokens to keep
        const allTokens = [...currentTokens, ...tokensToKeep];

        // Remove duplicates based on mintAddress (keep the latest one)
        const uniqueTokens = allTokens.filter((token, index, self) =>
            index === self.findIndex((t) => t.mintAddress === token.mintAddress)
        );

        // Sort all tokens by createdAt ascending
        const sortedTokens = uniqueTokens.sort((a, b) => 
            new Date(a.createdAt) - new Date(b.createdAt)
        );
        
        // Write sorted tokens back to original file
        await fs.writeFile(TOKENS_FILE, JSON.stringify(sortedTokens, null, 2));
        console.log(`Saved ${sortedTokens.length} tokens to file (${tokensToKeep.length} from processing, ${currentTokens.length} existing)`);
        
        // Clean up temp file
        try {
            await fs.unlink(TEMP_FILE);
        } catch (error) {
            // Ignore if temp file doesn't exist
        }
    } catch (error) {
        console.error('Error saving remaining tokens:', error);
    }
}


async function checkMarketcap() {
    try {
        // Move current tokens to temp file and get them
        const tokens = await moveTokensToTemp();
        console.log(`Checking ${tokens.length} tokens`);
        
        const MIN_PRICE = 0.00001;
        const MAX_PRICE = 0.00025;
        const tokensToKeep = [];
        const LIMITTIME = 20 * 60 * 1000;

        // Process each token
        for (const token of tokens) {
            console.log(`Checking price for token: ${token.mintAddress}`);
            const price = await getPriceInUSD(token.mintAddress);

            const tokenAge = Date.now() - new Date(token.createdAt).getTime();
            
            if (price === null) {
                if (tokenAge < LIMITTIME) {
                    console.log(`Skipping token ${token.mintAddress} - no price data, keeping as it's newer than 20 minutes`);
                    tokensToKeep.push(token);
                } else {
                    console.log(`Removing token ${token.mintAddress} - no price data after 20 minutes`);
                }
                continue;
            }

            if (price >= MIN_PRICE && price <= MAX_PRICE) {
                console.log(`Token ${token.mintAddress} price ${price} is within range`);
                await saveTokenToDB(token, price);
            } else {
                console.log(`Removing token ${token.mintAddress} - price ${price} is out of range`)
            }
        }
        await saveRemainingTokens(tokensToKeep);
    } catch (error) {
        console.error('Error in checkMarketcap:', error);
    } finally {
        await prisma.$disconnect();
    }
}

module.exports = checkMarketcap;