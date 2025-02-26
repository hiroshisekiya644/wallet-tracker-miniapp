const { createClient } =  require('graphql-ws');
const WebSocket = require('ws');
// const { PrismaClient } = require('@prisma/client');
const fs = require('fs').promises;
const axios = require('axios');
const path = require('path');
require('dotenv').config();

// const prisma = new PrismaClient();

const API_URL = 'wss://streaming.bitquery.io/eap';
const BITQUERY_API_KEY = process.env.BITQUERY_API_KEY;
const MAX_RETRIES = 10;
const RETRY_DELAY = 1000;

const STORAGE_DIR = path.join(__dirname, 'jsons');
const TOKENS_FILE = path.join(STORAGE_DIR, 'created_tokens.json');

const ensureStorageDir = async () => {
    try {
        await fs.mkdir(STORAGE_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating storage directory:', error);
    }
}

const readTokensFile = async () => {
    try {
        await ensureStorageDir();
        try {
            const data = await fs.readFile(TOKENS_FILE, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return [];
        }
    } catch (error) {
        console.error('Error reading tokens file:', error);
        return [];
    }
}

const saveTokensToJson = async (newToken) => {
    try {
        await ensureStorageDir();
        const tokens = await readTokensFile();
        tokens.push(newToken);
        await fs.writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2));
        console.log('Token added to tokens.json : ', newToken.mintAddress);
    } catch (error) {
        console.error('Error saving tokens to JSON:', error);
    }
}

const TOKEN_CREATION_QUERY = `
  subscription {
    Solana {
      TokenSupplyUpdates(
        where: {Instruction: {Program: {Address: {is: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"}, Method: {is: "create"}}}}
      ) {
        Block {
          Time
        }
        Transaction {
          Signer
        }
        TokenSupplyUpdate {
          Amount
          Currency {
            Symbol
            MintAddress
            Name
            Decimals
            Uri
          }
          PostBalance
        }
      }
    }
  }
`;

let retryCount = 0;

const client = createClient({ 
    url: `${API_URL}?token=${BITQUERY_API_KEY}`, 
    webSocketImpl: WebSocket,
    connectionParams: async () => {
        return {
            "x-api-key": BITQUERY_API_KEY
        };
    },
    on: {
        connected: (socket) => {
            console.log('Connected to WebSocket');
            retryCount = 0; // Reset retry count on successful connection
        },
        error: (error) => {
            console.error('WebSocket error:', {
                message: error.message,
                type: error.type,
                code: error.code,
                statusCode: error?.target?._req?.res?.statusCode,
                target: error?.target?._url
            });
        },
        closed: () => {
            console.log('WebSocket connection closed');
            // Attempt to reconnect if connection was closed unexpectedly
            if (retryCount < MAX_RETRIES) {
                retryCount++;
                console.log(`Attempting to reconnect in ${RETRY_DELAY/1000} seconds... (Attempt ${retryCount}/${MAX_RETRIES})`);
                setTimeout(tokenSubscribe, RETRY_DELAY);
            }
        }
    }
});

const tokenSubscribe = () => {
    try {
        console.log('Setting up subscription...');
        client.subscribe(
            {
                query: TOKEN_CREATION_QUERY,
            },
            {
                next: async (data) => {
                    if (!data?.data?.Solana?.TokenSupplyUpdates) {
                        console.warn('Received invalid data format:', data);
                        return;
                    }
                    
                    const updates = data.data.Solana.TokenSupplyUpdates;
                    // console.log('New Token Created:', JSON.stringify(updates, null, 2));
                    const tokenCount = await countTokenByCreator(updates[0]?.Transaction?.Signer);
                    if(tokenCount < 2) {
                        try {
                            const tokenData = updates[0]?.TokenSupplyUpdate?.Currency;
                            const creationTime = updates[0]?.Block?.Time;
                            const creator = updates[0]?.Transaction?.Signer;
                            const postBalance = updates[0]?.TokenSupplyUpdate?.PostBalance;
                            const amount = updates[0]?.TokenSupplyUpdate?.Amount;
                            if (!tokenData || !creationTime || !creator) {
                                console.warn('Missing required token data:', { tokenData, creationTime, creator });
                            } else {
                                const token = {
                                    name: tokenData.Name,
                                    symbol: tokenData.Symbol,
                                    decimals: tokenData.Decimals,
                                    mintAddress: tokenData.MintAddress,
                                    amount: amount,
                                    uri: tokenData.Uri,
                                    creator: creator,
                                    creationTime: creationTime,
                                    postBalance: postBalance,
                                    createdAt: new Date()
                                };
                                // prisma.token.create({
                                //     data: token,
                                // }).then(() => {
                                //     console.log('Token saved to DB:', token);
                                // }).catch((error) => {
                                //     console.error('Error saving token to DB:', error);
                                // });
                                
                                saveTokensToJson(token);
                            }
                        } catch (error) {
                            console.log('Error saving token to DB : ', error);
                        }
                    }

                },
                error: (err) => {
                    console.error('Subscription error:', {
                        message: err.message,
                        type: err.type,
                        code: err.code,
                        details: err
                    });
                    
                    if (retryCount < MAX_RETRIES) {
                        retryCount++;
                        console.log(`Retrying subscription in ${RETRY_DELAY/1000} seconds... (Attempt ${retryCount}/${MAX_RETRIES})`);
                        setTimeout(tokenSubscribe, RETRY_DELAY);
                    } else {
                        console.error('Max retry attempts reached. Stopping subscription.');
                        client.dispose();
                        process.exit(1);
                    }
                },
                complete: () => {
                    console.log('Subscription completed');
                },
            }
        );
    } catch (error) {
        console.error('Setup error:', error);
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`Retrying in ${RETRY_DELAY/1000} seconds... (Attempt ${retryCount}/${MAX_RETRIES})`);
            setTimeout(tokenSubscribe, RETRY_DELAY);
        } else {
            console.error('Max retry attempts reached. Stopping subscription.');
            client.dispose();
            process.exit(1);
        }
    }
}

const countTokenByCreator = async (creatorAddress) => {
    const query = `{
        Solana(network: solana) {
            Instructions(
                where: {Instruction: {Program: {Name: {is: "pump"}, Method: {is: "create"}}}, Transaction: {Signer: {is: "${creatorAddress}"}}}
                orderBy: {descendingByField: "tokens_count"}
            ) {
                tokens_count: count
            }
        }
    }`;

    try {
        const response = await axios.post(
            "https://streaming.bitquery.io/eap",
            { query },
            { headers: { "Authorization": `Bearer ${BITQUERY_API_KEY}` } }
        );
        return response.data.data.Solana.Instructions[0].tokens_count;
    } catch (error) {
        console.error("Error fetching token data:", error.response?.data || error.message);
    }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Closing WebSocket connection...');
    await prisma.$disconnect();
    client.dispose();
    process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);
    await prisma.$disconnect();
    client.dispose();
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    await prisma.$disconnect();
    client.dispose();
    process.exit(1);
});

// Start the subscription
console.log('Starting Solana token creation monitoring...');

module.exports = tokenSubscribe;