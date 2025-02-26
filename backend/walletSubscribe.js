const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { Connection, PublicKey } = require('@solana/web3.js');
const { createPrivateKey } = require('crypto');
require('dotenv').config();

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const connection = new Connection(SOLANA_RPC_URL);

const prisma = new PrismaClient();

const BITQUERY_API_KEY = process.env.BITQUERY_API_KEY;
const OUTPUT_FILE = path.join(__dirname, "jsons", 'token_holders.json');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getMintaddresses = async () => {
    try {
        const tokens = await prisma.token.findMany({
            select: {
                mintAddress: true
            }
        });
        return tokens.map(token => token.mintAddress);
    } catch (error) {
        console.error('Error fetching mint addresses:', error);
        return [];
    } finally {
        await prisma.$disconnect();
    }
}

const chunkArray = (array, size) => {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
};

const isFresh = async(holder) => {
    delay(40);
    const address = new PublicKey(holder.BalanceUpdate.Account.Owner);
    const txCount = await connection.getTransactionCount(address);
    return txCount > 30 ? false : true;
}

const getAccountOwnersBatch = async (accounts) => {
    const accountChunks = chunkArray(accounts, 100);
    let owners = [];

    for (const chunk of accountChunks) {
        try {
            const publicKeys = chunk.map((acc) => new PublicKey(acc));
            delay(300);
            const accountsInfo = await connection.getMultipleAccountsInfo(publicKeys);
            owners.push(...accountsInfo.map((info) => info?.owner?.toBase58()));
        } catch (error) {
            console.error('Error fetching account info batch:', error.message);
        }
    }

    return owners;
}; 

const getTokenHolders = async (mintAddress) => {
    const query = `
        query GetTokenHolders {
            Solana {
                BalanceUpdates(
                    orderBy: {descendingByField: "BalanceUpdate_Holding_maximum"}
                    where: {BalanceUpdate: {Currency: {MintAddress: {is: "${mintAddress}"}}}, Transaction: {Result: {Success: true}}}
                ) {
                    BalanceUpdate {
                        Currency {
                            Name
                            MintAddress
                            Symbol
                        }
                        Account {
                            Address
                            Owner
                        }
                        Holding: PostBalance(maximum: Block_Slot)
                    }
                }
            }
        }
    `;

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

        const holders = response.data?.data?.Solana?.BalanceUpdates.filter(holder => holder.BalanceUpdate.Holding <= 300000000 || []);
        const owners = await getAccountOwnersBatch(holders.map((holder) => holder.BalanceUpdate.Account.Owner));
        const filteredHolders = holders.filter((holder, index) => 
            owners[index] === "11111111111111111111111111111111"
        );
        return filteredHolders;
    } catch (error) {
        console.error('Error fetching token holders:', error.response?.data || error.message);
        return null;
    }
}

const saveTokenHoldersToFile = async (holders) => {
    try {
        let existingData = [];
        try {
            const fileData = await fs.readFile(OUTPUT_FILE, 'utf8');
            existingData = JSON.parse(fileData);
        } catch (error) {
            console.log('No existing data found, starting fresh.');
            existingData = [];
        }

        const dataMap = new Map(existingData.map(holder => 
            [`${holder.BalanceUpdate.Account.Address}-${holder.BalanceUpdate.Currency.MintAddress}`, holder]
        ));

        holders.forEach(holder => {
            const key = `${holder.BalanceUpdate.Account.Address}-${holder.BalanceUpdate.Currency.MintAddress}`;
            
            if (dataMap.has(key)) {
                dataMap.get(key).Holding = holder.Holding;
            } else {
                if (isFresh(holder)) {
                    dataMap.set(key, holder);
                }
            }
        });

        const updatedData = Array.from(dataMap.values());

        await fs.writeFile(OUTPUT_FILE, JSON.stringify(updatedData, null, 2));
        console.log(`Token holders saved to ${OUTPUT_FILE}`);
    } catch (error) {
        console.error('Error saving token holders to file:', error);
    }
};


const walletSubscribe = async () => {
    const mintAddresses = await getMintaddresses();
    let allHolders = [];

    for (const mintAddress of mintAddresses) {
        const holders = await getTokenHolders(mintAddress);
        if (holders && holders.length > 0) {
            allHolders = [...allHolders, ...holders];
        } else {
            console.log(`No holders found for mintaddress: ${mintAddress}`);
        }
    }
    
    if (allHolders.length > 0) {
        await saveTokenHoldersToFile(allHolders);
    } else {
        console.log('No holders found or an error occurred.');
    }
}

module.exports = walletSubscribe;