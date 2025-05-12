require('dotenv').config();
const OpenAI = require('openai');
const config = require('./ifc_config_exemples.json');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function suggestElementType(inputName, category) {
  const typeNames = config[category]?.types.map(t => t.name) || [];

  const prompt = `The element name is "${inputName}". Here is a list of standard types:\n${typeNames.join(', ')}.\nSuggest the most relevant type name from the list for this element.`;
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo", // fallback model
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
  });
  if (completion.choices.length === 0) {
    throw new Error("No completion received");
  }  
  console.log('completion', completion.choices[0].message.content.trim());
  return completion.choices[0].message.content.trim();
}

suggestElementType("Wall", "walls")
  .then(response => console.log("Suggested type:", response))
  .catch(error => console.error("Error:", error));
module.exports = { suggestElementType };
