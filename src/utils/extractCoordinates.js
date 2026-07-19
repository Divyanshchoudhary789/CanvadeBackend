const axios = require("axios");

async function extractCoordinates(mapUrl) {
  if (!mapUrl || typeof mapUrl !== "string") {
    return null;
  }

  try {
    const response = await axios.get(mapUrl, {
      maxRedirects: 10,
      timeout: 10000,
      validateStatus: () => true,
    });

    const finalUrl =
      response?.request?.res?.responseUrl || response?.request?.path || mapUrl;

    const patterns = [
      /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
      /[?&]q=(-?\d+(?:\.\d+)?)%2C(-?\d+(?:\.\d+)?)/,
      /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
      /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    ];

    for (const pattern of patterns) {
      const match = finalUrl.match(pattern);
      if (match) {
        return {
          latitude: Number.parseFloat(match[1]),
          longitude: Number.parseFloat(match[2]),
        };
      }
    }

    return null;
  } catch (error) {
    console.error("Map extraction error:", error);
    return null;
  }
}

module.exports = extractCoordinates;