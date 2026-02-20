import { prisma } from "../../lib/prisma";

export type ExecuteTransactionInput = {
    type: "TOPUP" | "BONUS" | "SPEND";
    walletId: string;
    amount : bigint;
    idempotencyKey : string;
}

export type TransactionResult = {
    transactionId: string;
    balance: string;
};

class DomainError extends Error {
    constructor(message: string, public statusCode: number = 400) {
        super(message);
        this.name = "DomainError";
    }
}



export async function executeTransaction(input: ExecuteTransactionInput): Promise<TransactionResult> {
    return prisma.$transaction(async (tx) => {

        let transaction;
        try {
            transaction = await tx.transaction.create({
                data: {
                    idempotencyKey: input.idempotencyKey,
                    type: input.type,
                    status: "PENDING",
                },
            });
        } catch (e: any) {
            if (e.code === "P2002") {
                const settled = await prisma.transaction.findUnique({
                    where: { idempotencyKey: input.idempotencyKey },
                });
                if (settled?.status === "COMPLETED") {
                    return settled.response as TransactionResult;
                }
                throw new DomainError("Duplicate request in progress, retry shortly", 409);
            }
            throw e;
        }

        
        const userWallet = await tx.wallet.findUnique({ where: { id: input.walletId } });
        if (!userWallet) throw new DomainError("Wallet not found", 404);

        const systemWalletType = input.type === "SPEND" ? "REVENUE" : "TREASURY";
        const systemWallet = await tx.systemWallet.findUnique({
            where: { system_asset_wallet: { assetTypeId: userWallet.assetTypeId, walletType: systemWalletType } },
        });
        if (!systemWallet) throw new DomainError(`${systemWalletType} wallet missing`, 500);

       
        const [lockedUserWallet] = await tx.$queryRaw<{ id: string; cachedBalance: bigint }[]>`
            SELECT id, "cachedBalance" FROM "Wallet" WHERE id = ${userWallet.id} FOR UPDATE
        `;
        await tx.$queryRaw`
            SELECT id FROM "SystemWallet" WHERE id = ${systemWallet.id} FOR UPDATE
        `;

        
        if (input.type === "SPEND" && lockedUserWallet.cachedBalance < input.amount) {
            throw new DomainError("Insufficient funds", 422);
        }

        
        let userDelta : bigint;
        let systemDelta : bigint;

        if(input.type === "SPEND") {
            userDelta = -input.amount;
            systemDelta = input.amount;
        }else{
            userDelta = input.amount;
            systemDelta = -input.amount;

        }

        const updatedWallet = await tx.wallet.update({
            where : { id : userWallet.id },
            data : {cachedBalance : {increment : userDelta}}
        });
        await tx.systemWallet.update({
            where : {id : systemWallet.id },
            data : {cachedBalance : {increment : systemDelta}}
        })

        
        await tx.ledgerEntry.createMany({
            data: [
                {
                    transactionId: transaction.id,
                    walletId: userWallet.id,
                    direction: input.type === "SPEND" ? "DEBIT" : "CREDIT",
                    amount: input.amount,
                },
                {
                    transactionId: transaction.id,
                    systemWalletId: systemWallet.id,
                    direction: input.type === "SPEND" ? "CREDIT" : "DEBIT",
                    amount: input.amount,
                },
            ],
        });

       
        const result: TransactionResult = {
            transactionId: transaction.id,
            balance: updatedWallet.cachedBalance.toString(),
        };

        await tx.transaction.update({
            where: { id: transaction.id },
            data: { status: "COMPLETED", response: result },
        });

        return result;
    });
}