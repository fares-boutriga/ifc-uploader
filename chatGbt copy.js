// const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const WebIFC = require('web-ifc'); // Used for IfcAPI constants and potentially instance

const config = require('./ifc_config_exemples.json');
const { updateIfcElement } = require('./utils/extractElements'); // Import the new function
const openai = require('./openIaConfig');



/**
 * Interacts with the OpenAI assistant.
 * @param {string} userInput The user's message.
 * @param {string} [ifcFileName] The filename of the IFC model relevant to this chat session (e.g., "12345.ifc").
 * @param {string} [threadId] The ID of the thread to use for this chat session.
 * @returns {Promise<string>} The assistant's response.
 */
async function chatWithAssistant(userInput, ifcFileName= "ifcFile.ifc",threadId, openaiFileId="file-B4aLo8NH7eKezE5s4tWtaB") {
  try {
    // 1. Create a thread
    console.log('userInput', userInput);
    // const thread = await openai.beta.threads.create();

    // 2. Add a message to the thread
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
            // content: userInput

      content: [
                {
                    type: "file_search",
                    file_id: openaiFileId,
                },
                {
                    type: "input_text",
                    text: userInput,
                },
            ],
    });

    // 3. Run the assistant
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: process.env.ASSISTANT_ID, // use your actual Assistant ID here
    });

    // 4. Wait for the run to complete
    let runStatus;
    const terminalStates = ['completed', 'failed', 'cancelled', 'expired'];

    do {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // wait 1s
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);

      if (['failed', 'cancelled', 'expired'].includes(runStatus.status)) {
        const errorMessage = runStatus.last_error ? runStatus.last_error.message : `Run ${runStatus.status}.`;
        console.error(`Run ended with status: ${runStatus.status}. Error: ${errorMessage}`);
        return `Assistant run ${runStatus.status}. ${errorMessage}`;
      }

      if (runStatus.status === 'requires_action') {
        console.log("Run requires action. Processing tool calls...");
        const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
        const toolOutputs = [];

        for (const toolCall of toolCalls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments); // Arguments are a JSON string

          console.log(`Attempting to call function: ${functionName} with args:`, functionArgs);
          let toolOutputContent;

          if (functionName === "updateIfcElement") {
            if (!ifcFileName) {
              console.error("IFC file context not available for updateIfcElement tool call.");
              toolOutputContent = JSON.stringify({
                success: false,
                message: "Cannot perform IFC update: No IFC file is associated with this session.",
                details: []
              });
            } else {
              const currentIfcFilePath = path.join(__dirname, 'uploads', ifcFileName); // Assumes files are in 'uploads'
              const newPath = path.join(__dirname, "uploads", "new_" + ifcFileName);
              let ifcApiInstance;
              let modelID;

              if (!fs.existsSync(currentIfcFilePath)) {
                console.error(`IFC file not found at: ${currentIfcFilePath}`);
                toolOutputContent = JSON.stringify({
                  success: false,
                  message: `IFC file '${ifcFileName}' not found. Cannot perform updates.`,
                  details: functionArgs.updates.map(u => ({ ...u, status: "failed", reason: "IFC file not found" }))
                });
              } else {
                try {
                  ifcApiInstance = new WebIFC.IfcAPI();
                  await ifcApiInstance.Init();
                  const fileData = fs.readFileSync(currentIfcFilePath);
                  const ifcModelData = new Uint8Array(fileData);
                  modelID = ifcApiInstance.OpenModel(ifcModelData);

                  // if (modelID === 0) throw new Error("Failed to open IFC model for updates.");

                  console.log(`Calling actual updateIfcElement for modelID ${modelID} on file ${currentIfcFilePath}`);
                  const results = updateIfcElement(ifcApiInstance, modelID, functionArgs.updates);

                  // Save the modified IFC model
                  const updatedIfcData = ifcApiInstance.SaveModel(modelID);
                  fs.writeFileSync(newPath, updatedIfcData); // Overwrite the existing file
                  console.log(`IFC model saved to ${newPath} after updates.`);

                  toolOutputContent = JSON.stringify({
                    success: results.summary.failed === 0,
                    message: `IFC elements update process completed. Successful: ${results.summary.successful}, Failed: ${results.summary.failed}. File '${ifcFileName}' has been updated.`,
                    summary: results.summary,
                    details: results.details
                  });

                } catch (error) {
                  console.error("Error during IFC update operation:", error);
                  toolOutputContent = JSON.stringify({
                    success: false,
                    message: `Error processing IFC update for '${ifcFileName}': ${error.message}`,
                    details: functionArgs.updates.map(u => ({ ...u, status: "failed", reason: error.message }))
                  });
                } finally {
                  if (ifcApiInstance && modelID) {
                    ifcApiInstance.CloseModel(modelID);
                  }
                  // ifcApiInstance.Dispose(); // If web-ifc has a dispose method
                }
              }
            }
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: toolOutputContent,
            });
          } else {
            console.warn(`Unknown function call requested: ${functionName}`);
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: JSON.stringify({ success: false, message: `Function ${functionName} is not implemented.` }),
            });
          }
        }

        // Submit all tool outputs back to the Assistant
        if (toolOutputs.length > 0) {
          try {
            await openai.beta.threads.runs.submitToolOutputs(threadId, run.id, {
              tool_outputs: toolOutputs,
            });
            console.log("Tool outputs submitted successfully.");
          } catch (error) {
            console.error("Error submitting tool outputs:", error);
            // Decide how to handle this error, e.g., fail the run or try to inform the user
            return `Error submitting tool outputs to the assistant: ${error.message}`;
          }
        }
      }

    } while (runStatus.status !== 'completed');

    // 5. Retrieve the messages (ordered by latest first by default)
    const messages = await openai.beta.threads.messages.list(threadId, { order: 'desc' });

    // Find the first assistant message in the list (which will be the latest one)
    const assistantMessage = messages.data.find(
      (msg) => msg.role === 'assistant' && msg.content[0]?.type === 'text'
    );

    if (assistantMessage && assistantMessage.content[0]?.text?.value) {
      return assistantMessage.content[0].text.value;
    } else {
      console.warn("Assistant completed but no suitable text message found.", messages.data);
      return 'Assistant responded, but the message content was not in the expected format or was empty.';
    }

  } catch (error) {
    console.error('Error in chatWithAssistant:', error);
    return `An error occurred while communicating with the assistant: ${error.message || error.toString()}`;
  }
}

const uploadFileToOpenAI = async (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist at path: ${filePath}`);
    }
    const response = await openai.files.create({
      file: fs.createReadStream(filePath),
      purpose: 'assistants',
    });
    console.log('File uploaded successfully:', response);
    return response.id;
  } catch (error) {
    console.error('Failed to upload file to OpenAI:', error);
    throw error;
  }
};

module.exports = {
  chatWithAssistant,
  uploadFileToOpenAI
};
