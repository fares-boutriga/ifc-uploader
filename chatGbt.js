// const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const WebIFC  = require('web-ifc')
require('dotenv').config();
const OpenAI = require('openai');
const config = require('./ifc_config_exemples.json');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORG_ID // Add this line
});
async function chatWithAssistant(userInput) {
  try {
    // 1. Create a thread
    const thread = await openai.beta.threads.create();

    // 2. Add a message to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: userInput,
    });

    // 3. Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.ASSISTANT_ID, // use your actual Assistant ID here
    });

    // 4. Wait for the run to complete
    let runStatus;
    const terminalStates = ['completed', 'failed', 'cancelled', 'expired'];

    do {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // wait 1s
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);

      if (['failed', 'cancelled', 'expired'].includes(runStatus.status)) {
        const errorMessage = runStatus.last_error ? runStatus.last_error.message : `Run ${runStatus.status}.`;
        console.error(`Run ended with status: ${runStatus.status}. Error: ${errorMessage}`);
        return `Assistant run ${runStatus.status}. ${errorMessage}`;
      }
      // Note: If your assistant uses tools that require function calls,
      // you would also need to handle `runStatus.status === 'requires_action'` here.

    } while (runStatus.status !== 'completed');

    // 5. Retrieve the messages (ordered by latest first by default)
    const messages = await openai.beta.threads.messages.list(thread.id, { order: 'desc' });

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

module.exports = {
  chatWithAssistant
};
