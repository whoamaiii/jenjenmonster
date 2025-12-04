import { GoogleGenAI, Type } from "@google/genai";
import { MonsterCard, ElementType, Rarity, Move } from "../types";

// =============================================================================
// SECURITY WARNING: API Key Handling
// =============================================================================
// This application currently embeds the API key in the client bundle.
// For production use, you MUST:
// 1. Create a backend proxy endpoint (e.g., /api/generate-cards)
// 2. Move the API key to server-side environment variables
// 3. Call the proxy from this service instead of Gemini directly
// =============================================================================

/**
 * Validates that the API key is configured and returns it.
 * Throws a clear error if missing.
 */
const getApiKey = (): string => {
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    console.error(
      '[GeminiService] API key not configured. ' +
      'Set GEMINI_API_KEY in your environment variables.'
    );
    throw new Error('Gemini API key not configured');
  }

  // Development warning about client-side API key
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
    console.warn(
      '[GeminiService] WARNING: API key is embedded in the client bundle. ' +
      'This is insecure for production. Use a backend proxy instead.'
    );
  }

  return apiKey;
};

/**
 * Creates a configured Gemini AI client instance.
 */
const createAIClient = (): GoogleGenAI => {
  return new GoogleGenAI({ apiKey: getApiKey() });
};

// =============================================================================
// Type Definitions for API Responses
// =============================================================================

/** Raw card data structure from Gemini API */
interface RawCardResponse {
  name: string;
  type: string;
  hp: number;
  rarity: string;
  flavorText: string;
  visualPrompt: string;
  moves: Array<{
    name: string;
    damage: string;
    cost: number;
    description: string;
  }>;
}

/** Validates and transforms raw card data to MonsterCard */
const validateAndTransformCard = (
  raw: RawCardResponse,
  index: number
): MonsterCard => {
  // Validate required fields
  if (!raw.name || typeof raw.name !== 'string') {
    throw new Error(`Card ${index}: missing or invalid name`);
  }
  if (!Object.values(ElementType).includes(raw.type as ElementType)) {
    console.warn(`Card ${index}: invalid type "${raw.type}", defaulting to Fire`);
    raw.type = ElementType.Fire;
  }
  if (!Object.values(Rarity).includes(raw.rarity as Rarity)) {
    console.warn(`Card ${index}: invalid rarity "${raw.rarity}", defaulting to Common`);
    raw.rarity = Rarity.Common;
  }

  const rarity = raw.rarity as Rarity;
  // Mythical cards are ALWAYS shiny. Others have 15% chance.
  const isShiny = rarity === Rarity.Mythical || Math.random() < 0.15;

  const moves: Move[] = (raw.moves || []).map((m, i) => ({
    name: m.name || `Move ${i + 1}`,
    damage: m.damage || '0',
    cost: Math.min(4, Math.max(1, m.cost || 1)),
    description: m.description || ''
  }));

  return {
    id: `card-${Date.now()}-${index}-${Math.floor(Math.random() * 10000)}`,
    name: raw.name,
    type: raw.type as ElementType,
    hp: typeof raw.hp === 'number' ? raw.hp : 50,
    rarity,
    flavorText: raw.flavorText || '',
    visualPrompt: raw.visualPrompt || '',
    moves,
    isShiny
  };
};

// =============================================================================
// System Instructions & Prompts
// =============================================================================

const CARD_GENERATION_SYSTEM_PROMPT = `You are a creative game designer for "JenJen Monsters", a Christmas Advent Calendar trading card game made for Jenny.

MANDATORY LANGUAGE RULES:
1. Name, FlavorText, Move Names, Move Descriptions MUST be in NORWEGIAN.
2. **CRITICAL**: The 'visualPrompt' field MUST be in ENGLISH. This is used by an image generator that only understands English.

THEME INSTRUCTIONS:
The monsters MUST be related to Christmas, Winter, and specifically NORWEGIAN Christmas traditions (Nisser, Troll, Julemat).

THEME IDEAS (Mix these):
1. MAT & DRIKKE: "Sinte-Pepperkake", "Levende Lussekatt", "Julebrus-Slime", "Ribbe-Kriger", "Pinnekjøtt-Beist", "Marsipangrisen", "Mandarin-Skrell", "Riskrem-Klumpen".
2. TRADISJONER: "Fjøsnisse", "Julebukk", "Sølvgutt", "Pakke-Tyv", "Juletre-Monster", "Glitter-Troll".
3. VINTER: "Snømannen Kalle", "Hullete Ullsokk", "Istapp-Drage", "Skiføre-Fantomet", "Nordlys-Ånd".
4. CUTE/COZY: "Sovende Katt i Juletre", "Kakao-Kopp", "Varmepute-Spøkelse".

VISUAL PROMPT INSTRUCTIONS (ENGLISH ONLY):
- Provide a clear, descriptive visual description of the monster's physical appearance and action.
- Focus on shape, color, accessories, and immediate surroundings.
- Example: "A grumpy-looking gingerbread man with slightly burnt edges, holding a candy cane like a club, standing defiantly in the snow."

PACK STRUCTURE (5 CARDS TOTAL):
- Card 1, 2, 3: Common or Uncommon. (Fun, simple monsters).
- Card 4: Rare. (Cooler, stronger design).
- Card 5: The "Hit" card. Rare (40%), Legendary (40%), or Mythical (20%). Make this one epic.
`;

// =============================================================================
// JSON Parsing Utilities
// =============================================================================

/**
 * Robustly extracts and parses JSON from LLM response text.
 * Handles common issues like markdown code blocks, trailing commas, comments.
 */
const parseJsonResponse = (text: string): unknown => {
  let jsonString = text;

  // 1. Find valid JSON array bounds, ignoring surrounding text
  const firstBracket = jsonString.indexOf('[');
  const lastBracket = jsonString.lastIndexOf(']');

  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    jsonString = jsonString.substring(firstBracket, lastBracket + 1);
  }

  // 2. Remove markdown code block markers
  jsonString = jsonString.replace(/```json/gi, '').replace(/```/g, '');

  // 3. Clean up common LLM syntax errors
  jsonString = jsonString.replace(/\/\/.*$/gm, ''); // Remove comments
  jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas

  try {
    return JSON.parse(jsonString);
  } catch (firstError) {
    console.warn('[GeminiService] JSON parse failed, attempting aggressive cleanup', firstError);

    // More aggressive cleanup
    jsonString = jsonString.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');

    try {
      return JSON.parse(jsonString);
    } catch (secondError) {
      console.error('[GeminiService] Final JSON parse failed', secondError);
      throw new Error('Could not parse card data from API response');
    }
  }
};

// =============================================================================
// Fallback Data
// =============================================================================

const createFallbackCards = (): MonsterCard[] => {
  const timestamp = Date.now();
  return [
    {
      id: `fallback-${timestamp}-1`,
      name: 'Sinte-Pepperkake',
      type: ElementType.Fire,
      hp: 65,
      rarity: Rarity.Common,
      flavorText: "Ingen vet hvorfor han er så sur, men han smaker godt!",
      visualPrompt: 'A grumpy-looking gingerbread man with slightly burnt edges, holding a candy cane like a club, standing defiantly in the snow.',
      moves: [
        { name: 'Hardt Bitt', damage: '10', cost: 1, description: 'Et skikkelig jafs.' },
        { name: 'Krydder Sprut', damage: '20', cost: 2, description: 'En sky av kanel og ingefær.' }
      ],
      isShiny: false
    },
    {
      id: `fallback-${timestamp}-2`,
      name: 'Fjøsnissen',
      type: ElementType.Dark,
      hp: 80,
      rarity: Rarity.Rare,
      flavorText: "Husk å sette ut grøt, ellers knyter han knuter på halen til katta!",
      visualPrompt: 'A traditional Norwegian barn gnome (Fjøsnisse) with a red hat, grey wool clothes, hiding in the shadows of a barn with a lantern.',
      moves: [
        { name: 'Nissestrek', damage: '30', cost: 2, description: 'Lurer motstanderen trill rundt.' },
        { name: 'Grøtsleiv', damage: '50', cost: 3, description: 'Et tungt slag med tresleiva.' }
      ],
      isShiny: false
    },
    {
      id: `fallback-${timestamp}-3`,
      name: 'Is-Dragen',
      type: ElementType.Water,
      hp: 120,
      rarity: Rarity.Legendary,
      flavorText: "Laget av nordlys og isbre-vann. Vokter Nordkapp.",
      visualPrompt: 'A majestic dragon made entirely of jagged ice crystals and snow, with aurora borealis glowing in its chest, perched on a mountain peak.',
      moves: [
        { name: 'Fryseånde', damage: '60', cost: 3, description: 'Fryser alt til is.' },
        { name: 'Nordlys-Stråle', damage: '90', cost: 4, description: 'En blendende stråle av magisk lys.' }
      ],
      isShiny: true
    },
    {
      id: `fallback-${timestamp}-4`,
      name: 'Julebrus-Slime',
      type: ElementType.Water,
      hp: 50,
      rarity: Rarity.Common,
      flavorText: "Klissete, rød og full av sukker. Ikke søl!",
      visualPrompt: 'A cute slime monster made of red soda (Julebrus), bubbling and fizzy, with a bottle cap as a hat.',
      moves: [
        { name: 'Brus-Sprut', damage: '15', cost: 1, description: 'Kullsyre i øynene!' },
        { name: 'Sukker-Sjokk', damage: '25', cost: 2, description: 'Gjør motstanderen hyperaktiv og forvirret.' }
      ],
      isShiny: false
    },
    {
      id: `fallback-${timestamp}-5`,
      name: 'Granbar-Troll',
      type: ElementType.Grass,
      hp: 90,
      rarity: Rarity.Uncommon,
      flavorText: "Lukter som en hel skog og stikker som bare det.",
      visualPrompt: 'A small troll made of pine branches, cones, and moss, blending into a winter forest.',
      moves: [
        { name: 'Nåleregn', damage: '20', cost: 1, description: 'Skyter skarpe barnåler.' },
        { name: 'Kvaeklyse', damage: '40', cost: 2, description: 'Klissete kvae som fanger fienden.' }
      ],
      isShiny: false
    }
  ];
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Generates a booster pack of 5 monster cards using Gemini AI.
 * Falls back to predefined cards if API call fails.
 */
export const generateBoosterPack = async (): Promise<MonsterCard[]> => {
  try {
    const ai = createAIClient();

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Generate a booster pack of 5 unique monsters adhering to the slot structure.",
      config: {
        systemInstruction: CARD_GENERATION_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              type: { type: Type.STRING, enum: Object.values(ElementType) },
              hp: { type: Type.INTEGER },
              rarity: { type: Type.STRING, enum: Object.values(Rarity) },
              flavorText: { type: Type.STRING },
              visualPrompt: { type: Type.STRING, description: "Must be in English" },
              moves: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    damage: { type: Type.STRING },
                    cost: { type: Type.INTEGER, description: "Energy cost 1-4" },
                    description: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!response.text) {
      throw new Error("No text returned from Gemini API");
    }

    const rawData = parseJsonResponse(response.text) as RawCardResponse[];

    if (!Array.isArray(rawData)) {
      throw new Error("API response is not an array");
    }

    return rawData.map((card, index) => validateAndTransformCard(card, index));

  } catch (error) {
    console.error("[GeminiService] Failed to generate card pack:", error);
    return createFallbackCards();
  }
};

// =============================================================================
// Image Generation
// =============================================================================

/** Style modifiers based on element type */
const TYPE_MODIFIERS: Record<ElementType, string> = {
  [ElementType.Fire]: "warm glowing embers, fireplace lighting, orange and red hues, cozy warmth, flickering candlelight, cute flame spirits",
  [ElementType.Water]: "shimmering ice crystals, snowflakes, frosty atmosphere, blue and white hues, wet reflections, bubbles",
  [ElementType.Grass]: "detailed pine needles, holly berries, festive wreaths, organic textures, lush green and red, nature magic",
  [ElementType.Electric]: "twinkling fairy lights, energetic sparks, bright yellow and neon glow, dynamic lightning, batteries",
  [ElementType.Psychic]: "mystical purple nebula, floating ornaments, dreamlike haze, glitter, magical aura, stars",
  [ElementType.Dark]: "midnight blue sky, aurora borealis, mysterious shadows, moonlit snow, deep purple contrast, mischievous",
  [ElementType.Dragon]: "majestic scales, smoky breath, mythical power, cute wings, epic stance",
  [ElementType.Steel]: "polished silver, metallic ornaments, reflections, industrial winter, gold trim, shiny metal",
  [ElementType.Fairy]: "sparkling pixie dust, pastel pinks and purples, soft wings, magical glow, cute ribbons, candy colors"
};

/** Quality modifiers based on rarity */
const RARITY_MODIFIERS: Record<Rarity, string> = {
  [Rarity.Common]: "simple, clean, adorable, soft lighting, focus on character, smooth shapes",
  [Rarity.Uncommon]: "dynamic pose, detailed texture, expressive face, sharp focus, fun background",
  [Rarity.Rare]: "glowing magical aura, intricate background details, volumetric lighting, particle effects, impressive",
  [Rarity.Legendary]: "epic cinematic composition, majestic pose, dramatic rim lighting, masterpiece, detailed environment, awe-inspiring",
  [Rarity.Mythical]: "ethereal, divine, cosmic energy, surreal, mind-blowing detail, transcendent, god-tier art, otherworldly"
};

/**
 * Generates card artwork using Gemini AI image generation.
 * Returns empty string on failure.
 */
export const generateCardArt = async (
  visualPrompt: string,
  cardName: string,
  type: ElementType,
  rarity: Rarity
): Promise<string> => {
  try {
    const ai = createAIClient();

    const typeStyle = TYPE_MODIFIERS[type] || "magical atmosphere";
    const rarityStyle = RARITY_MODIFIERS[rarity] || "high quality";
    const specificStyle = `${typeStyle} combined with ${rarityStyle}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: {
        parts: [
          {
            text: `
            Create a "Cute 3D Isometric Render" style image.

            SUBJECT: ${cardName}
            VISUAL DESCRIPTION: ${visualPrompt}

            STYLE GUIDELINES:
            - **Core Style**: Cute 3D Isometric Render (Blender/Cinema 4D/Redshift).
            - **Material**: Toy-like, matte clay or soft plastic textures, slight gloss (resin/vinyl toy look).
            - **Aesthetic**: Chibi proportions, round shapes, soft edges, adorable, festive.
            - **Lighting**: Soft volumetric lighting, studio setup, bright and cozy global illumination.
            - **Composition**: Character centered on a simple background, isometric view, depth of field.
            - **Specific Elements**: ${specificStyle}.

            NEGATIVE PROMPT:
            - 2D, flat, drawing, sketch, cartoon, anime, outline, cel shading, line art, vector.
            - Photorealistic, gritty, horror (unless Dark type), scary, ugly, distorted, blurry.
            - Text, watermarks, card borders, frames, cropping, human faces.
            `,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "1K"
        }
      },
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData) {
          const base64ImageBytes: string = part.inlineData.data;
          return `data:image/jpeg;base64,${base64ImageBytes}`;
        }
      }
    }

    throw new Error("No image generated in response");

  } catch (error) {
    console.error("[GeminiService] Failed to generate image:", error);
    return "";
  }
};

/**
 * Edits existing card artwork based on a text prompt.
 * Throws on failure (caller should handle).
 */
export const editCardArt = async (
  currentImageBase64: string,
  editPrompt: string
): Promise<string> => {
  // Input validation
  const sanitizedPrompt = editPrompt.trim().slice(0, 200).replace(/[<>]/g, '');
  if (!sanitizedPrompt) {
    throw new Error("Edit prompt cannot be empty");
  }

  const base64Data = currentImageBase64.split(',')[1];
  if (!base64Data) {
    throw new Error("Invalid base64 image string");
  }

  try {
    const ai = createAIClient();

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data,
            },
          },
          {
            text: `
            Edit this image based on the following instruction: "${sanitizedPrompt}".
            Maintain the "Cute 3D Isometric Render" style. Keep the toy-like, clay/plastic texture.
            `,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "1K"
        }
      },
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData) {
          const base64ImageBytes: string = part.inlineData.data;
          return `data:image/jpeg;base64,${base64ImageBytes}`;
        }
      }
    }

    throw new Error("No edited image generated in response");

  } catch (error) {
    console.error("[GeminiService] Failed to edit image:", error);
    throw error;
  }
};
