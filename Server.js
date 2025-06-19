const express = require("express");
const app = express();
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http");
const cookieParser = require("cookie-parser");
const redisconfig = require("./config/redisConfig");

//dbconnection and admin create ------->
const dbConnection = require("./config/dbConnection");
// const createAdmin = require("./Admin/Adminsetup");

//config..............>
dotenv.config({ path: "config/.env" });
app.use(cors({
  origin: "*",
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(function (err, req, res, next) {
  // Handle specific errors like 502, 504, etc.
  if (err.status === 502 || err.status === 504) {
    res.status(502).json({ error: "Bad Gateway" });
  } else {
    next(err);
  }
});

// Create the server---------->
const server = http.createServer(app);

//Route Import----------------->
const propmt = require("./Routes/AiRoutes");
const file = require("./Routes/FileRoutes");



app.get("/test", (req, res) => {
  res.send("Welcome to the AI Tool API");
});
app.use("/api", propmt);
app.use("/api", file);



// dbConnection-------------->
// createAdmin();


server.listen(process.env.PORT, () => {
  dbConnection();
  console.log(`🚀 Server running successfully`);
});
