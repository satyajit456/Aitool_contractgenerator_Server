const mongoose = require("mongoose");

const dbConnection = () => {
  mongoose
    .connect(process.env.DB_URL, {
      //   useNewUrlParser: true,
      //   useUnifiedTopology: true,
    })
    .then((data) => {
      console.log(`database connected to: ${data.connection.host}`);
    })
    .catch((error) => {
      console.log("database connetion faild", error);
    });
};

module.exports = dbConnection;
