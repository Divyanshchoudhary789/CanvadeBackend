const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

const uploadFile = async (file, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
      },
      (error, result) => {
        if (error) return reject(error);

        resolve(result.secure_url); 
      }
    );

    streamifier.createReadStream(file.buffer).pipe(stream);
  });
};

module.exports = { uploadFile };    