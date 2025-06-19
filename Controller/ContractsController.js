const Contract = require("../Model/uploadfileModel");

exports.getUserContracts = async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Fetch contracts where userId matches the given user_id
    const contracts = await Contract.find({ userId: user_id });

    if (!contracts || contracts.length === 0) {
      return res
        .status(404)
        .json({ message: "No contracts found for this user." });
    }

    return res.status(200).json({
      success: true,
      message: "Contracts fetched successfully",
      data: contracts,
    });
  } catch (error) {
    console.error("Error fetching contracts:", error);
    return res.status(500).json({ error: "Server error" });
  }
};
