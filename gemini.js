// Make sure to include the following import:
// import {GoogleGenAI} from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const prompt = "Tell me about this image";
const organ = await ai.files.upload({
  file: path.join(media, "organ.jpg"),
  config: { mimeType: "image/jpeg" },
});

const countTokensResponse = await ai.models.countTokens({
  model: "gemini-2.0-flash",
  contents: createUserContent([
    prompt,
    createPartFromUri(organ.uri, organ.mimeType),
  ]),
});
console.log(countTokensResponse.totalTokens);

const generateResponse = await ai.models.generateContent({
  model: "gemini-2.0-flash",
  contents: createUserContent([
    prompt,
    createPartFromUri(organ.uri, organ.mimeType),
  ]),
});
console.log(generateResponse.usageMetadata);