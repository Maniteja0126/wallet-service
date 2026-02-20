import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({
    connectionString : process.env.DATABASE_URL!
})

const prisma = new PrismaClient({adapter});

async function main() {
    console.log("Seeding database...");

    const assets = await Promise.all([
        prisma.assetType.upsert({
            where : { name : "Gold Coins"},
            update : {},
            create : { name : "Gold Coins" , symbol : "GOLD"}
        }),

        prisma.assetType.upsert({
            where : { name : "Diamonds" },
            update : {} ,
            create : { name : "Diamonds" , symbol : "DIA"}
        }),

        prisma.assetType.upsert({
            where : { name : "Loyality Points" },
            update : {} , 
            create : { name : "Loyality Points" , symbol : "LP"}
        })
    ]);

    console.log("AssetTypes created");

    const users = await Promise.all([
        prisma.user.upsert({
            where : {email : "user1@test.com"},
            update : {},
            create: { email: "user1@test.com" }
        }),
        prisma.user.upsert({
            where : {email : "user2@test.com"},
            update : {},
            create: { email: "user2@test.com" }        })
    ]);

    console.log("Users created");

for (const asset of assets) {
    await prisma.systemWallet.upsert({
      where: { system_asset_wallet: { assetTypeId: asset.id, walletType: "TREASURY" } },
      update: {},
      create: { assetTypeId: asset.id, walletType: "TREASURY", cachedBalance: 1_000_000n }
    });
    await prisma.systemWallet.upsert({
      where: { system_asset_wallet: { assetTypeId: asset.id, walletType: "REVENUE" } },
      update: {},
      create: { assetTypeId: asset.id, walletType: "REVENUE", cachedBalance: 1_000_000n }
    });
  }
  
  for (const user of users) {
    for (const asset of assets) {
      await prisma.wallet.upsert({
        where: { user_asset_wallet: { userId: user.id, assetTypeId: asset.id } },
        update: {},
        create: { userId: user.id, assetTypeId: asset.id, cachedBalance: 2_000_000n }
      });
    }
  }


    console.log("Waller created");
    console.log("Seeding completed");

}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    })