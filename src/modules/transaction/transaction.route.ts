import { FastifyInstance } from "fastify";
import { executeTransaction } from "./transaction.service";
import { prisma } from "../../lib/prisma";


const transactionBodySchema = {
    type: "object",
    required: ["walletId", "amount"],
    properties: {
      walletId: { type: "string" },
      amount: { type: "integer"  , minimum : 1},
    }
};

const transactionHeadersSchema = {
    type : "object",
    required : ["idempotency-key"],
    properties : {
        "idempotency-key" : { type : "string"}
    }
}
  
const transactionResponseSchema = {
    200: {
      type: "object",
      required : ["transactionId" , "balance"],
      properties: {
        transactionId: { type: "string" },
        balance: { type: "string" }
      }
    }
};

export default async function (app : FastifyInstance) {
    async function handler(type : "TOPUP" | "BONUS" | "SPEND" , req : any) {
        const {walletId , amount  } = req.body;

        const idempotencyKey = req.headers["idempotency-key"] as string;

        if(!idempotencyKey) {
            throw app.httpErrors.badRequest("Missing Idempotency-key header");
        }

        return executeTransaction({
            type ,
            walletId,
            amount : BigInt(amount),
            idempotencyKey
        });
    }

    app.post("/topup", {schema : {
        tags: ["transactions"],
        summary : "Top up wallet",
        headers : transactionHeadersSchema, 
        body : transactionBodySchema,
        response : transactionResponseSchema
    }} , async(req) => handler("TOPUP" , req));

    app.post("/bonus" , {schema : {
        tags: ["transactions"],
        summary : "Issue bonus credits",
        headers : transactionHeadersSchema,
        body : transactionBodySchema,
        response : transactionResponseSchema
    }} , async(req) => handler("BONUS" , req));


    app.post("/spend" , {schema : {
        tags : ["transactions"],
        summary : "Spend wallet balance",
        headers : transactionHeadersSchema,
        body : transactionBodySchema,
        response : transactionResponseSchema
    }} , async(req) => handler("SPEND" , req));


    app.get("/:transactionId" ,{
        schema: {
          tags: ["transactions"],
          summary: "Get transaction by ID",
          params: {
            type: "object",
            required: ["transactionId"],
            properties: {
              transactionId: { type: "string" }
            }
          },
          response: {
            200: {
              type: "object",
              properties: {
                id: { type: "string" },
                idempotencyKey : { type : "string"},
                type: { type: "string" },
                status: { type: "string" },
                response: { 
                    type: "object", 
                    nullable: true ,
                    properties : {
                        transactionId : {type : "string"},
                        balance : {type : "string"}
                    }
                },
                createdAt: { type: "string" }
              }
            }
          }
        } 
    }, async (req : any) => {
            const { transactionId } = req.params;

            const transaction = await prisma.transaction.findUnique({
                where : {id : transactionId}
            });

            if(!transaction) {
                throw app.httpErrors.notFound("Transaction not found");
            }

            console.log("tnx " , transaction);

            return transaction;
        }
    );
}

