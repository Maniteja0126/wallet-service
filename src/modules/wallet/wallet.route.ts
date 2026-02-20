import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma";


const walletParamsSchema = {
    type: "object",
    required: ["walletId"],
    properties: {
      walletId: { type: "string" }
    }
};
  
const walletResponseSchema = {
    200: {
      type: "object",
      required : ["walletId" , "balance"],
      properties: {
        walletId: { type: "string" },
        balance: { type: "string" }
      }
    }
};
  
const ledgerResponseSchema = {
    200: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          transactionId: { type: "string" },
          walletId: { type: "string" },
          direction: { type: "string" },
          amount: { type: "string" },
          type : { type : "string"},
          createdAt: { type: "string" }
        }
      }
    }
};

export default async function (app : FastifyInstance){

    app.get("/:walletId" , {
        schema : {
            tags : ["wallet"],
            summary : "Get wallet Balance",
            params : walletParamsSchema,
            response : walletResponseSchema
        }
    }, async (req : any) => {
        const walletId = req.params.walletId;


        const wallet = await prisma.wallet.findUnique({
            where : {id : walletId}
        });

        if(!wallet) app.httpErrors.notFound("Wallet not found");

        return {
            walletId : wallet?.id,
            balance : wallet?.cachedBalance.toString()
        }
    });

    app.get("/:walletId/ledger", {
        schema : {
            tags : ["wallet"],
            summary : "Get wallet ledger (last 50 entries",
            querystring : {
                type : "object",
                properties : {
                    cursor : {type : "string"},
                    limit : {type : "number" , default : 50}
                }
            },
            params : walletParamsSchema,
            response : ledgerResponseSchema
        }
    } , async(req: any) => {
        const { walletId } = req.params;
        const {limit = 50 , cursor } = req.query;

        const entries = await prisma.ledgerEntry.findMany({
            where : {walletId},
            include : { transaction : true},
            take : limit + 1,
            cursor : cursor ? { id : cursor } : undefined,
            skip : cursor ? 1 : 0,
            orderBy : {createdAt : "desc"},
        });

        return entries.map(e => ({
            id : e.id,
            direction : e.direction,
            amount : e.amount.toString(),
            transactionId : e.transactionId,
            type : e.transaction.type,
            createdAt : e.createdAt
        }))
        
    });

    app.get("/" , {
        schema : {
            tags : ["wallet"],
            summary : "Get all wallets for a user",
            querystring : {
                type : "object",
                required : ["userId"],
                properties : {
                    userId : { type : "string"}
                }
            },
            response : {
                200 : {
                    type : "array",
                    items : {
                        type : "object",
                        properties : {
                            walletId : {type : "string"},
                            asset : {
                                type : "object",
                                required : ["id" , "name" , "symbol"],
                                properties : {
                                    id : {type : "string"},
                                    name : {type : "string"},
                                    symbol : {type : "string"}
                                }
                            },
                            balance : {type : "string"}
                        }
                    }
                }
            }
        }
    } , async (req : any) => {
        const { userId } = req.query;

        const wallets = await prisma.wallet.findMany({
            where : { userId },
            include : {
                assetType : {
                    select : {
                        id : true ,
                        name : true,
                        symbol : true
                    }
                }
            }
        });


        return wallets.map(w => ({
            walletId: w.id,
            asset: {
              id: w.assetType.id,
              name: w.assetType.name,
              symbol: w.assetType.symbol
            },
            balance: w.cachedBalance.toString()
          }));
    });
}