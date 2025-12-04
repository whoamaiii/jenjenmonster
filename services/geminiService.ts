import { GoogleGenAI, Type, Modality } from "@google/genai";
import { MonsterCard, ElementType, Rarity } from "../types";

export const generateBoosterPack = async (): Promise<MonsterCard[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const systemInstruction = `You are a creative game designer for "JenJen Monsters", a Christmas Advent Calendar trading card game made for Jenny.
  
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

  const prompt = `Generate a booster pack of 5 unique monsters adhering to the slot structure.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
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
      throw new Error("No text returned from Gemini");
    }

    // Robust JSON extraction
    let jsonString = response.text;
    
    // 1. Find valid JSON array bounds, ignoring surrounding text
    const firstBracket = jsonString.indexOf('[');
    const lastBracket = jsonString.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      jsonString = jsonString.substring(firstBracket, lastBracket + 1);
    }
    
    // 2. Remove any lingering markdown code block markers (case insensitive)
    jsonString = jsonString.replace(/```json/gi, '').replace(/```/g, '');

    // 3. Clean up common LLM syntax errors
    // Remove comments (// ...) which are invalid in standard JSON
    jsonString = jsonString.replace(/\/\/.*$/gm, '');
    // Remove trailing commas in objects/arrays (e.g., { "a": 1, } -> { "a": 1 })
    jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1'); 

    let data;
    try {
        data = JSON.parse(jsonString);
    } catch (e) {
        console.warn("JSON parse failed, attempting aggressive cleanup", e);
        // Try removing standard markdown patterns again just in case, and fix common bracket issues
        jsonString = jsonString.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
        try {
            data = JSON.parse(jsonString);
        } catch (e2) {
            console.error("Final JSON parse failed", e2);
            throw new Error("Could not parse card data");
        }
    }
    
    // Add IDs to the cards and random shiny chance
    return data.map((card: any, index: number) => {
      // Mythical cards are ALWAYS shiny. Others have 15% chance.
      const isShiny = card.rarity === Rarity.Mythical ? true : Math.random() < 0.15;
      
      return {
        ...card,
        id: `card-${Date.now()}-${index}-${Math.floor(Math.random() * 10000)}`, // More unique ID
        isShiny: isShiny
      };
    });

  } catch (error) {
    console.error("Failed to generate card pack:", error);
    // Fallback/Mock data
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
  }
};

export const generateCardArt = async (visualPrompt: string, cardName: string, type: ElementType, rarity: Rarity): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    // 1. Define Style Modifiers based on Element Type
    const typeModifiers: Record<ElementType, string> = {
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

    // 2. Define Quality/Vibe Modifiers based on Rarity
    const rarityModifiers: Record<Rarity, string> = {
        [Rarity.Common]: "simple, clean, adorable, soft lighting, focus on character, smooth shapes",
        [Rarity.Uncommon]: "dynamic pose, detailed texture, expressive face, sharp focus, fun background",
        [Rarity.Rare]: "glowing magical aura, intricate background details, volumetric lighting, particle effects, impressive",
        [Rarity.Legendary]: "epic cinematic composition, majestic pose, dramatic rim lighting, masterpiece, detailed environment, awe-inspiring",
        [Rarity.Mythical]: "ethereal, divine, cosmic energy, surreal, mind-blowing detail, transcendent, god-tier art, otherworldly"
    };

    const specificStyle = `${typeModifiers[type] || "magical atmosphere"} combined with ${rarityModifiers[rarity] || "high quality"}`;

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
    console.error("Failed to generate image:", error);
    return "";
  }
};

export const editCardArt = async (currentImageBase64: string, editPrompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const base64Data = currentImageBase64.split(',')[1];
    if (!base64Data) throw new Error("Invalid base64 string");

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
            Edit this image based on the following instruction: "${editPrompt}".
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
    throw new Error("No edited image generated");

  } catch (error) {
    console.error("Failed to edit image:", error);
    throw error;
  }
};