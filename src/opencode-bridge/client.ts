import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/client"

const DEFAULT_SERVER_URL = "http://localhost:4096"

export type ServerConnection = {
  client: OpencodeClient
  serverUrl: string
  sessionId: string
}

export type ModelCapability = {
  providerId: string
  modelId: string
  modelName: string
  supportsImageInput: boolean
  modalitiesInput: string[]
}

export type CapabilityReport = {
  defaultModel: { providerId: string; modelId: string } | null
  defaultModelSupportsImage: boolean
  models: ModelCapability[]
}

export type PromptModelRef = {
  providerID: string
  modelID: string
}

export const DEFAULT_VYSTA_MODEL = "openai/gpt-5.4"

export class BridgeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BridgeError"
  }
}

export function discoverServerUrl(): string {
  const envUrl = process.env.OPENCODE_SERVER_URL
  if (envUrl) return envUrl
  return DEFAULT_SERVER_URL
}

export async function discoverSessionId(
  client: OpencodeClient
): Promise<string> {
  const envSession = process.env.OPENCODE_SESSION_ID
  if (envSession) return envSession

  const result = await client.session.list()
  if (result.error) {
    throw new BridgeError(
      `Failed to list sessions: ${JSON.stringify(result.error)}`
    )
  }
  const sessions = result.data
  if (!sessions || sessions.length === 0) {
    throw new BridgeError(
      "No sessions found. Start an OpenCode session first."
    )
  }
  return sessions[0].id
}

export function createClient(serverUrl: string) {
  const client = createOpencodeClient({ baseUrl: serverUrl })
  return { client, serverUrl }
}

export async function assertServerReady(
  serverUrl: string,
  client: OpencodeClient = createOpencodeClient({ baseUrl: serverUrl })
): Promise<void> {
  try {
    const providersResp = await client.config.providers()
    if (providersResp.error) {
      throw providersResp.error
    }
  } catch {
    throw new BridgeError(
      `OpenCode is not reachable at ${serverUrl}. Open OpenCode and retry.`
    )
  }
}

export async function getModelCapabilities(
  client: OpencodeClient
): Promise<CapabilityReport> {
  const providersResp = await client.config.providers()
  if (providersResp.error) {
    throw new BridgeError(
      `Failed to fetch providers: ${JSON.stringify(providersResp.error)}`
    )
  }

  const providersData = providersResp.data
  const models: ModelCapability[] = []
  let defaultProvider = ""
  let defaultModel = ""

  if (providersData?.default) {
    const entries = Object.entries(providersData.default)
    if (entries.length > 0) {
      defaultProvider = entries[0][0]
      defaultModel = entries[0][1]
    }
  }

  for (const provider of providersData?.providers ?? []) {
    for (const [modelId, modelInfo] of Object.entries(provider.models ?? {})) {
      const modalitiesInput = getInputModalities(modelInfo)
      models.push({
        providerId: provider.id,
        modelId,
        modelName: modelInfo.name ?? modelId,
        supportsImageInput: modalitiesInput.includes("image"),
        modalitiesInput,
      })
    }
  }

  const defaultCapability = models.find(
    (m) => m.providerId === defaultProvider && m.modelId === defaultModel
  )

  return {
    defaultModel: defaultProvider
      ? { providerId: defaultProvider, modelId: defaultModel }
      : null,
    defaultModelSupportsImage: defaultCapability?.supportsImageInput ?? false,
    models,
  }
}

export function findModelCapability(
  report: CapabilityReport,
  modelRef: string | undefined
): ModelCapability | null {
  if (!modelRef) {
    const defaultModel = report.defaultModel
    if (!defaultModel) return null
    return report.models.find(
      (m) =>
        m.providerId === defaultModel.providerId &&
        m.modelId === defaultModel.modelId
    ) ?? null
  }

  const [providerId, modelId] = modelRef.includes("/")
    ? modelRef.split("/", 2)
    : [undefined, modelRef]

  return report.models.find(
    (m) =>
      m.modelId === modelId &&
      (providerId === undefined || m.providerId === providerId)
  ) ?? null
}

export function toPromptModelRef(
  capability: ModelCapability
): PromptModelRef {
  return {
    providerID: capability.providerId,
    modelID: capability.modelId,
  }
}

function getInputModalities(modelInfo: any): string[] {
  const capabilityInput = modelInfo?.capabilities?.input
  if (!capabilityInput || typeof capabilityInput !== "object") {
    return Array.isArray(modelInfo?.modalities?.input)
      ? modelInfo.modalities.input
      : []
  }

  return Object.entries(capabilityInput)
    .filter(([, enabled]) => enabled === true)
    .map(([modality]) => modality)
}
