const Redis = require("ioredis");

const redis = new Redis({
    host: "redis-13486.c84.us-east-1-2.ec2.redns.redis-cloud.com",
    port: 13486,
    db: 0,
    password: "KebJEJP1KwwLcvPqm8f3LTj6ltFn2CeL",
    connectTimeout: 10000,
    retryStrategy: (times) => Math.min(times * 50, 2000),
});
 
redis.on("connect", () => console.log("Connected to Redis "));
redis.on("error", (err) => console.error(" Redis error:", err));
 
module.exports = redis;
