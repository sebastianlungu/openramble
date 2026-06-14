import { describe, it, expect } from "bun:test"
import {
  DEFAULT_VYSTA_MODEL,
  findModelCapability,
  getModelCapabilities,
} from "../opencode-bridge/client.js"

describe("OpenCode client capability parsing", () => {
  it("hard defaults OpenVysta to OpenAI GPT-5.4", () => {
    expect(DEFAULT_VYSTA_MODEL).toBe("openai/gpt-5.4")
  })

  it("reads image support from current capabilities payload", async () => {
    const report = await getModelCapabilities({
      config: {
        providers: async () => ({
          data: {
            default: { openai: "gpt-5.4" },
            providers: [
              {
                id: "openai",
                models: {
                  "gpt-5.4": {
                    name: "GPT-5.4",
                    capabilities: {
                      input: { text: true, image: true, pdf: true },
                    },
                  },
                },
              },
            ],
          },
          error: null,
        }),
      },
    } as any)

    expect(report.defaultModelSupportsImage).toBe(true)
    expect(report.models[0]?.modalitiesInput).toEqual(["text", "image", "pdf"])
  })

  it("keeps compatibility with legacy modalities payload", async () => {
    const report = await getModelCapabilities({
      config: {
        providers: async () => ({
          data: {
            default: { openai: "gpt-5.4" },
            providers: [
              {
                id: "openai",
                models: {
                  "gpt-5.4": {
                    name: "GPT-5.4",
                    modalities: {
                      input: ["text", "image"],
                    },
                  },
                },
              },
            ],
          },
          error: null,
        }),
      },
    } as any)

    expect(report.defaultModelSupportsImage).toBe(true)
    expect(report.models[0]?.modalitiesInput).toEqual(["text", "image"])
  })

  it("prefers current capabilities payload when both shapes exist", async () => {
    const report = await getModelCapabilities({
      config: {
        providers: async () => ({
          data: {
            default: { openai: "gpt-5.4" },
            providers: [
              {
                id: "openai",
                models: {
                  "gpt-5.4": {
                    name: "GPT-5.4",
                    modalities: {
                      input: ["text"],
                    },
                    capabilities: {
                      input: { text: true, image: true },
                    },
                  },
                },
              },
            ],
          },
          error: null,
        }),
      },
    } as any)

    expect(report.defaultModelSupportsImage).toBe(true)
    expect(report.models[0]?.modalitiesInput).toEqual(["text", "image"])
  })

  it("finds an explicitly requested model by provider and id", () => {
    const capability = findModelCapability(
      {
        defaultModel: { providerId: "google", modelId: "gemini" },
        defaultModelSupportsImage: true,
        models: [
          {
            providerId: "openai",
            modelId: "gpt-5.4",
            modelName: "GPT-5.4",
            supportsImageInput: true,
            modalitiesInput: ["text", "image"],
          },
        ],
      },
      "openai/gpt-5.4"
    )

    expect(capability?.providerId).toBe("openai")
    expect(capability?.modelId).toBe("gpt-5.4")
  })
})
