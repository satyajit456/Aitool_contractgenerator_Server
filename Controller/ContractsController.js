const Contract = require("../Model/uploadfileModel");


exports.getUserContracts = async (req, res) => {
  try {
    const { user_id } = req.params;
    const page = parseInt(req.query.page) || 1;       
    const limit = parseInt(req.query.limit) || 10;    
    const skip = (page - 1) * limit;

    if (!user_id) {
      return res.status(400).json({ error: "User ID is required" });
    }


    const totalDocuments = await Contract.countDocuments({ userId: user_id });

    const contracts = await Contract.find({ userId: user_id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      message: "Contracts fetched successfully",
      data: contracts,
      totalDocuments,
      currentPage: page,
      totalPages: Math.ceil(totalDocuments / limit),
    });
  } catch (error) {
    console.error("Error fetching contracts:", error);
    return res.status(500).json({ error: "Server error" });
  }
};



//function for wesignature redirectLink 
exports.WesignatureRedirectLink = async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "User ID is required in body" });
    }

    const redirectLink = `${process.env.FRONTEND_URL}${user_id}`;

    return res.status(200).json({
      message: "Redirect link ",
      redirectLink: redirectLink,
    });
  } catch (error) {
    console.error("Error generating redirect link:", error);
    return res.status(500).json({ error: "Server error" });
  }
};
