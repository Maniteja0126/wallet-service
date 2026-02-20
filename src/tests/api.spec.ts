import { describe , it , expect , beforeAll , afterAll} from "vitest";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";

let app : any;
let walletId : string;

beforeAll(async () => {
    app = buildApp();
    await app.ready();

    const wallet = await prisma.wallet.findFirst();
    if(!wallet) throw new Error("Seed First");

    walletId = wallet.id;

});

afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
})

describe("Trasactions API" , () => {
    it("TOPUP works" , async () => {
        const res = await app.inject({
            method : "POST",
            url : "/transactions/topup",
            headers : {
                "idempotency-key" : crypto.randomUUID()
            },
            payload : {
                walletId,
                amount : 100
            }
        });

        expect(res.statusCode).toBe(200);

        const body = res.json();
        expect(body.transactionId).toBeDefined();
        expect(body.balance).toBeDefined();
    });

    it("SPEND fails with insufficient funds", async () => {
        const res = await app.inject({
          method: "POST",
          url: "/transactions/spend",
          headers: {
            "idempotency-key": crypto.randomUUID()
          },
          payload: {
            walletId,
            amount: 9999999
          }
        });
    
        expect(res.statusCode).toBe(422);
      });
    
      it("Idempotency works via header", async () => {
        const key = crypto.randomUUID();
    
        const a = await app.inject({
          method: "POST",
          url: "/transactions/topup",
          headers: { "idempotency-key": key },
          payload: { walletId, amount: 50 }
        });
    
        const b = await app.inject({
          method: "POST",
          url: "/transactions/topup",
          headers: { "idempotency-key": key },
          payload: { walletId, amount: 50 }
        });
    
        expect(a.json().transactionId).toBe(b.json().transactionId);
      });
    });
    
    describe("Wallet API", () => {
    
      it("GET wallet balance", async () => {
        const res = await app.inject({
          method: "GET",
          url: `/wallet/${walletId}`
        });
    
        expect(res.statusCode).toBe(200);
        expect(res.json().balance).toBeDefined();
      });
    
      it("GET ledger", async () => {
        const res = await app.inject({
          method: "GET",
          url: `/wallet/${walletId}/ledger`
        });
    
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.json())).toBe(true);
    });

})