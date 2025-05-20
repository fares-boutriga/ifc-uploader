// const express = require('express');
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const WebIFC = require("web-ifc"); // Used for IfcAPI constants and potentially instance
require("dotenv").config();
const { updateIfcElementNames } = require("./utils/extractElements"); // Import the new function

const test = async (ifcFileName="ifcFile.ifc") => {
  try {
    const currentIfcFilePath = path.join(__dirname, "uploads", ifcFileName); // Assumes files are in 'uploads'
    const newPath = path.join(__dirname, "uploads", "new_" + ifcFileName);
    console.log('currentIfcFilePath', currentIfcFilePath);
    let ifcApiInstance;
    let modelID;
    ifcApiInstance = new WebIFC.IfcAPI();
    await ifcApiInstance.Init();
    const fileData = fs.readFileSync(currentIfcFilePath);
    const ifcModelData = new Uint8Array(fileData);
    modelID = ifcApiInstance.OpenModel(ifcModelData);

    // if (modelID === 0) throw new Error("Failed to open IFC model for updates.");

    console.log(
      `Calling actual updateIfcElementNames for modelID ${modelID} on file ${currentIfcFilePath}`
    );
     const updates= [
    { elementId: 20374, newName: 'xxxxxxxxxxx' }
  ]
    const results = updateIfcElementNames(
      ifcApiInstance,
      modelID,
      updates
    );

    // Save the modified IFC model
    const updatedIfcData = ifcApiInstance.SaveModel(modelID);
    fs.writeFileSync(newPath, updatedIfcData); // Overwrite the existing file
    console.log(`IFC model saved to ${newPath} after updates.`);

    toolOutputContent = JSON.stringify({
      success: results.summary.failed === 0,
      message: `IFC elements update process completed. Successful: ${results.summary.successful}, Failed: ${results.summary.failed}. File '${ifcFileName}' has been updated.`,
      summary: results.summary,
      details: results.details,
    });
    console.log("toolOutputContent", toolOutputContent);
  } catch (error) {
    console.error("Error during IFC update operation:", error);
    toolOutputContent = JSON.stringify({
      success: false,
      message: `Error processing IFC update for '${ifcFileName}': ${error.message}`,
    });
  }
};

test()