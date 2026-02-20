import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import { executeTransaction } from "../modules/transaction/transaction.service";

let userWalletId: string;

beforeAll(async () => {
    const wallet = await prisma.wallet.findFirst();
    if (!wallet) throw new Error("No wallets found — run seed first");
    userWalletId = wallet.id;
});

beforeEach(async () => {
    await prisma.ledgerEntry.deleteMany();
    await prisma.transaction.deleteMany();

    await prisma.wallet.updateMany({
        data: { cachedBalance: BigInt(1000) },
    });

    await prisma.systemWallet.updateMany({
        data: { cachedBalance: BigInt(0) },
    });
});

afterAll(async () => {
    await prisma.$disconnect();
});

it("TOPUP increases balance", async () => {
    const res = await executeTransaction({
        type: "TOPUP",
        walletId: userWalletId,
        amount: BigInt(100),
        idempotencyKey: "test-topup-1",
    });

    expect(res).toBeDefined();
    expect(res!.balance).toBe("1100"); 
});

it("SPEND decreases balance", async () => {
    const res = await executeTransaction({
        type: "SPEND",
        walletId: userWalletId,
        amount: BigInt(200),
        idempotencyKey: "test-spend-1",
    });

    expect(res!.balance).toBe("800"); 
});

it("BONUS increases balance", async () => {
    const res = await executeTransaction({
        type: "BONUS",
        walletId: userWalletId,
        amount: BigInt(50),
        idempotencyKey: "test-bonus-1",
    });

    expect(res!.balance).toBe("1050");
});

it("idempotency returns same transaction for duplicate key", async () => {
    const key = "idem-test-1";

    const a = await executeTransaction({
        type: "TOPUP",
        walletId: userWalletId,
        amount: BigInt(50),
        idempotencyKey: key,
    });

    const b = await executeTransaction({
        type: "TOPUP",
        walletId: userWalletId,
        amount: BigInt(50),
        idempotencyKey: key,
    });

    expect(a!.transactionId).toBe(b!.transactionId);

    const wallet = await prisma.wallet.findUnique({ where: { id: userWalletId } });
    expect(wallet!.cachedBalance.toString()).toBe("1050");
});

it("SPEND fails with insufficient funds", async () => {
    await expect(
        executeTransaction({
            type: "SPEND",
            walletId: userWalletId,
            amount: BigInt(9_999_999),
            idempotencyKey: "fail-spend-1",
        })
    ).rejects.toThrow("Insufficient funds");
});

it("double-entry ledger is balanced after SPEND", async () => {
    await executeTransaction({
        type: "SPEND",
        walletId: userWalletId,
        amount: BigInt(300),
        idempotencyKey: "ledger-check-1",
    });

    const entries = await prisma.ledgerEntry.findMany();
    expect(entries).toHaveLength(2);

    const debit  = entries.find(e => e.direction === "DEBIT");
    const credit = entries.find(e => e.direction === "CREDIT");

    expect(debit).toBeDefined();
    expect(credit).toBeDefined();
    expect(debit!.amount).toBe(BigInt(300));
    expect(credit!.amount).toBe(BigInt(300));

    expect(debit!.amount).toEqual(credit!.amount);
});

it("concurrent SPENDs only allow valid debits", async () => {
    const amount = BigInt(300);

    const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
            executeTransaction({
                type: "SPEND",
                walletId: userWalletId,
                amount,
                idempotencyKey: `race-${i}`, 
            }).then(
                (r) => ({ ok: true, r }),
                (e) => ({ ok: false, e })
            )
        )
    );

    const successes = results.filter((r) => r.ok);
    const failures  = results.filter((r) => !r.ok);

    console.log(`Successes: ${successes.length}, Failures: ${failures.length}`);

    expect(successes.length).toBeLessThanOrEqual(3);
    expect(successes.length).toBeGreaterThan(0);
    expect(failures.length).toBeGreaterThan(0);

    const wallet = await prisma.wallet.findUnique({ where: { id: userWalletId } });
    expect(wallet!.cachedBalance).toBeGreaterThanOrEqual(BigInt(0));

    for (const f of failures) {
        expect((f as any).e.message).toBe("Insufficient funds");
    }
});


async function runConcurrent(count : number , batch = 100){
    let success = 0 ;
    let failed = 0;

    for(let i = 0; i< count; i+= batch){
        const slice = Array.from({length : batch} , (_ , j) => i + j)
            .filter(n => n < count);

        const results = await Promise.all(
            slice.map(i => executeTransaction({
                type : "SPEND",
                walletId : userWalletId,
                amount : 1n,
                idempotencyKey : `race-${i}`
            }).then(
                () => ({ ok : true}),
                () => ({ ok : false})
            ))
        );

        for(const r of results) r.ok ? success++ : failed++;
    }
    return { success , failed}
}

it("handles 1M spends safelt" , async() => {
    const TOTAL = 5_000;

    const { success , failed } = await runConcurrent(TOTAL , 200);
    
    console.log({success , failed});
    
    const wallet = await prisma.wallet.findUnique({
        where : { id : userWalletId}
    });

    expect(wallet!.cachedBalance).toBeGreaterThanOrEqual(0);
    expect(success + failed).toBe(TOTAL);
}, 60_000)