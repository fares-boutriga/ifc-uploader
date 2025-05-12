const OpenAI = require('openai');
const dotenv = require('dotenv');
dotenv.config();
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORG_ID,
});



const testfunction = async () => {
  const response = await client.responses.create({
    model: "gpt-4.1",
    instructions: "Talk like a pirate.",
    input: "Are semicolons optional in JavaScript?",
});

console.log(response.output_text);
};
testfunction().catch(error => console.error("Error:", error));
