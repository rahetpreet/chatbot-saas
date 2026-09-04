import { FlowNodeData } from "@/types";
import { getAIProvider } from "../ai";
import prisma from "@/lib/prisma";
import { answerFromKnowledge } from "@/lib/services/knowledge/answer";

export interface EngineNode {
  id: string;
  type?: string;
  data: FlowNodeData;
  position?: { x: number; y: number };
}

export interface EngineEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
}

export interface ConversationState {
  conversationId?: string;
  tenantId: string;
  currentNodeId: string | null;
  collectedData: Record<string, any>;
  sessionStatus: "ACTIVE" | "HANDOVER" | "RESOLVED" | "ABANDONED";
  history: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  visitorInfo?: {
    ip?: string;
    userAgent?: string;
    utm?: Record<string, string>;
    device?: string;
  };
}

export interface StepOutput {
  botMessages: Array<{
    text: string;
    mediaType?: "image" | "video" | "pdf" | "none";
    mediaUrl?: string;
    attachments?: any[];
  }>;
  interactiveNode: EngineNode | null;
  sessionStatus: "ACTIVE" | "HANDOVER" | "RESOLVED" | "ABANDONED";
  updatedCollectedData: Record<string, any>;
  currentNodeId: string | null;
  error?: string;
}

export class FlowEngine {
  private nodes: Map<string, EngineNode>;
  private edges: EngineEdge[];
  private tenantId: string;
  private aiConfigJson?: string | null;

  constructor(nodes: EngineNode[], edges: EngineEdge[], tenantId: string, aiConfigJson?: string | null) {
    this.nodes = new Map(nodes.map((n) => [n.id, n]));
    this.edges = edges;
    this.tenantId = tenantId;
    this.aiConfigJson = aiConfigJson;
  }

  public getStartNode(): EngineNode | null {
    // Find node with data.nodeType === 'start' or node of type 'start'
    for (const node of this.nodes.values()) {
      if (node.data?.nodeType === "start" || node.type === "start") {
        return node;
      }
    }
    // Fallback to first node if none specifically marked start
    const iterator = this.nodes.values().next();
    return iterator.done ? null : iterator.value;
  }

  private getOutgoingEdges(nodeId: string, handleId?: string | null): EngineEdge[] {
    return this.edges.filter((e) => {
      if (e.source !== nodeId) return false;
      if (handleId && e.sourceHandle && e.sourceHandle !== handleId) return false;
      return true;
    });
  }

  private getNextNode(nodeId: string, handleId?: string | null): EngineNode | null {
    const outgoing = this.getOutgoingEdges(nodeId, handleId);
    if (outgoing.length === 0) return null;
    const targetId = outgoing[0].target;
    return this.nodes.get(targetId) || null;
  }

  // Replace variable placeholders like {{name}} or {{email}} with collectedData values
  private interpolate(template: string, data: Record<string, any>): string {
    if (!template) return "";
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
      return data[key] !== undefined && data[key] !== null ? String(data[key]) : "";
    });
  }

  // Execute conversation step
  public async processInput(
    state: ConversationState,
    userInput?: {
      type: "text" | "button_click" | "form_submit" | "attachment_upload";
      value: any;
      buttonId?: string;
    }
  ): Promise<StepOutput> {
    const botMessages: StepOutput["botMessages"] = [];
    const collected = { ...state.collectedData };
    let currentStatus = state.sessionStatus;
    let currNode = state.currentNodeId ? this.nodes.get(state.currentNodeId) || null : null;

    // If starting a fresh session without a currentNodeId
    if (!currNode) {
      currNode = this.getStartNode();
      if (!currNode) {
        return {
          botMessages: [{ text: "Hello! How can we assist you today?" }],
          interactiveNode: null,
          sessionStatus: "ACTIVE",
          updatedCollectedData: collected,
          currentNodeId: null,
        };
      }
      // If start node, immediately transition to its target
      const nextFromStart = this.getNextNode(currNode.id);
      currNode = nextFromStart || currNode;
    } else if (userInput) {
      // 1. Process User Input for the current awaiting node
      const nodeType = currNode.data?.nodeType || currNode.type;

      if (nodeType === "input") {
        const key = currNode.data.inputKey || "answer";
        const val = String(userInput.value || "").trim();

        // Validation
        if (currNode.data.required && !val) {
          return {
            botMessages: [{ text: "This field is required. Please provide a response." }],
            interactiveNode: currNode,
            sessionStatus: currentStatus,
            updatedCollectedData: collected,
            currentNodeId: currNode.id,
            error: "Validation failed: required field.",
          };
        }

        if (currNode.data.inputType === "email") {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (val && !emailRegex.test(val)) {
            return {
              botMessages: [{ text: "Please enter a valid email address (e.g. name@example.com)." }],
              interactiveNode: currNode,
              sessionStatus: currentStatus,
              updatedCollectedData: collected,
              currentNodeId: currNode.id,
              error: "Invalid email format.",
            };
          }
        }

        if (currNode.data.inputType === "phone") {
          const phoneRegex = /^[\d\s+()-]{7,20}$/;
          if (val && !phoneRegex.test(val)) {
            return {
              botMessages: [{ text: "Please enter a valid phone number." }],
              interactiveNode: currNode,
              sessionStatus: currentStatus,
              updatedCollectedData: collected,
              currentNodeId: currNode.id,
              error: "Invalid phone format.",
            };
          }
        }

        collected[key] = val;
        currNode = this.getNextNode(currNode.id);
      } else if (nodeType === "buttons") {
        const optionId = userInput.buttonId || userInput.value;
        const options = currNode.data.options || [];
        const selectedOpt = options.find((o) => o.id === optionId || o.value === optionId || o.label === optionId);
        
        if (selectedOpt) {
          collected[currNode.data.inputKey || "choice"] = selectedOpt.label;
        }

        // Branching: check edge with specific handle matching option ID
        let next = this.getNextNode(currNode.id, selectedOpt?.id || optionId);
        if (!next) {
          // Fallback to general outgoing edge
          next = this.getNextNode(currNode.id);
        }
        currNode = next;
      } else if (nodeType === "attachment") {
        const fileData = userInput.value;
        if (!fileData || typeof fileData !== "object" || typeof fileData.url !== "string") {
          return {
            botMessages: [{ text: "Please upload a valid file to continue." }],
            interactiveNode: currNode,
            sessionStatus: currentStatus,
            updatedCollectedData: collected,
            currentNodeId: currNode.id,
            error: "Validation failed: attachment is required.",
          };
        }
        const key = currNode.data.inputKey || "attachment";
        collected[key] = fileData;
        currNode = this.getNextNode(currNode.id);
      } else if (nodeType === "ai_fallback") {
        // Answered strictly from the workspace's own knowledge base. A model
        // asked a question its documents do not cover will invent a plausible
        // answer, and a confident wrong answer about price or availability is
        // worse for the business than handing over.
        const answer = await answerFromKnowledge({
          tenantId: this.tenantId,
          aiConfigJson: this.aiConfigJson,
          question: String(userInput.value || ""),
          businessName: currNode.data.aiPrompt ? undefined : undefined,
          history: state.history,
        });

        if (answer.answered) {
          botMessages.push({ text: this.interpolate(answer.content, collected) });
        } else {
          // Out of scope: say so plainly and put a person on it.
          botMessages.push({
            text: this.interpolate(
              currNode.data.handoverMessage ||
                "That is a good question, and I would rather not guess. Let me connect you with someone from the team who can answer properly.",
              collected,
            ),
          });
          currentStatus = "HANDOVER";
        }

        // Keep at AI node or advance if edge exists
        const next = this.getNextNode(currNode.id);
        if (next) {
          currNode = next;
        } else {
          return {
            botMessages,
            interactiveNode: currNode,
            sessionStatus: currentStatus,
            updatedCollectedData: collected,
            currentNodeId: currNode.id,
          };
        }
      }
    }

    // 2. Traverse non-interactive nodes (Message, Condition, Webhook, Handover, Close)
    let safetyCounter = 0;
    while (currNode && safetyCounter < 25) {
      safetyCounter++;
      const nodeType = currNode.data?.nodeType || currNode.type;

      if (nodeType === "message") {
        const text = this.interpolate(currNode.data.messageText || "", collected);
        botMessages.push({
          text,
          mediaType: currNode.data.mediaType,
          mediaUrl: currNode.data.mediaUrl,
        });
        currNode = this.getNextNode(currNode.id);
      } else if (nodeType === "condition") {
        const conditions = currNode.data.conditions || [];
        let matchedBranch = null;

        for (const cond of conditions) {
          const varVal = collected[cond.variable] !== undefined ? String(collected[cond.variable]) : "";
          const targetVal = String(cond.value || "");
          let isMatch = false;

          switch (cond.operator) {
            case "equals":
              isMatch = varVal.toLowerCase() === targetVal.toLowerCase();
              break;
            case "not_equals":
              isMatch = varVal.toLowerCase() !== targetVal.toLowerCase();
              break;
            case "contains":
              isMatch = varVal.toLowerCase().includes(targetVal.toLowerCase());
              break;
            case "greater_than":
              isMatch = parseFloat(varVal) > parseFloat(targetVal);
              break;
            case "less_than":
              isMatch = parseFloat(varVal) < parseFloat(targetVal);
              break;
            case "is_set":
              isMatch = varVal.trim().length > 0;
              break;
            case "is_not_set":
              isMatch = varVal.trim().length === 0;
              break;
          }

          if (isMatch) {
            matchedBranch = cond.id;
            break;
          }
        }

        let nextNode: EngineNode | null = null;
        if (matchedBranch) {
          nextNode = this.getNextNode(currNode.id, matchedBranch);
        }
        if (!nextNode) {
          // Fallback branch
          nextNode = this.getNextNode(currNode.id, "fallback") || this.getNextNode(currNode.id);
        }
        currNode = nextNode;
      } else if (nodeType === "webhook") {
        if (currNode.data.webhookUrl) {
          try {
            const interpolatedUrl = this.interpolate(currNode.data.webhookUrl, collected);
            const method = currNode.data.webhookMethod || "POST";
            let body = undefined;
            if (method !== "GET" && currNode.data.webhookBody) {
              body = this.interpolate(currNode.data.webhookBody, collected);
            }

            const res = await fetch(interpolatedUrl, {
              method,
              headers: {
                "Content-Type": "application/json",
                ...(currNode.data.webhookHeaders || {}),
              },
              body: body ? body : JSON.stringify(collected),
            });

            if (res.ok) {
              const json = await res.json();
              collected["webhookResponse"] = json;
            }
          } catch (e) {
            console.warn("Webhook execution warning:", e);
          }
        }
        currNode = this.getNextNode(currNode.id);
      } else if (nodeType === "handover") {
        currentStatus = "HANDOVER";
        if (currNode.data.handoverMessage) {
          botMessages.push({
            text: this.interpolate(currNode.data.handoverMessage, collected),
          });
        }
        return {
          botMessages,
          interactiveNode: currNode,
          sessionStatus: currentStatus,
          updatedCollectedData: collected,
          currentNodeId: currNode.id,
        };
      } else if (nodeType === "close") {
        currentStatus = "RESOLVED";
        if (currNode.data.closingMessage) {
          botMessages.push({
            text: this.interpolate(currNode.data.closingMessage, collected),
          });
        }
        return {
          botMessages,
          interactiveNode: null,
          sessionStatus: currentStatus,
          updatedCollectedData: collected,
          currentNodeId: currNode.id,
        };
      } else if (nodeType === "buttons" || nodeType === "input" || nodeType === "attachment" || nodeType === "ai_fallback") {
        // Interactive node reached - include its prompt/message and stop traversal to await user input
        if (nodeType === "input") {
          const promptText = currNode.data.messageText || currNode.data.promptText;
          if (promptText) {
            botMessages.push({
              text: this.interpolate(promptText, collected),
            });
          }
        } else if (nodeType === "buttons") {
          const promptText = currNode.data.messageText || currNode.data.promptText;
          if (promptText) {
            botMessages.push({
              text: this.interpolate(promptText, collected),
            });
          }
        } else if (nodeType === "attachment") {
          const promptText = currNode.data.uploadPrompt || currNode.data.messageText || currNode.data.promptText;
          if (promptText) {
            botMessages.push({
              text: this.interpolate(promptText, collected),
            });
          }
        } else if (nodeType === "ai_fallback") {
          const promptText = currNode.data.promptText || currNode.data.messageText;
          if (promptText) {
            botMessages.push({
              text: this.interpolate(promptText, collected),
            });
          }
        }

        return {
          botMessages,
          interactiveNode: currNode,
          sessionStatus: currentStatus,
          updatedCollectedData: collected,
          currentNodeId: currNode.id,
        };
      } else {
        // Unknown or custom node
        currNode = this.getNextNode(currNode.id);
      }
    }

    return {
      botMessages,
      interactiveNode: currNode,
      sessionStatus: currentStatus,
      updatedCollectedData: collected,
      currentNodeId: currNode ? currNode.id : null,
    };
  }
}
