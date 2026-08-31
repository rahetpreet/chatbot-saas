"use client";

import React from "react";
import { X, Trash2, Plus, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { FlowNodeData } from "@/types";

interface NodeConfigDrawerProps {
  node: any | null;
  onClose: () => void;
  onUpdateNodeData: (nodeId: string, newData: Partial<FlowNodeData>) => void;
  onDeleteNode: (nodeId: string) => void;
}

export function NodeConfigDrawer({ node, onClose, onUpdateNodeData, onDeleteNode }: NodeConfigDrawerProps) {
  if (!node) return null;

  const data: FlowNodeData = node.data || {};
  const nodeType = data.nodeType || node.type || "message";

  const handleChange = (key: keyof FlowNodeData, value: any) => {
    onUpdateNodeData(node.id, { [key]: value });
  };

  // Button Options handlers
  const handleAddOption = () => {
    const currentOptions = data.options || [];
    const newOpt = {
      id: `opt-${Date.now()}`,
      label: `Option ${currentOptions.length + 1}`,
      value: `option_${currentOptions.length + 1}`,
    };
    handleChange("options", [...currentOptions, newOpt]);
  };

  const handleUpdateOption = (index: number, field: "label" | "value", val: string) => {
    const currentOptions = [...(data.options || [])];
    currentOptions[index] = { ...currentOptions[index], [field]: val };
    handleChange("options", currentOptions);
  };

  const handleRemoveOption = (index: number) => {
    const currentOptions = [...(data.options || [])];
    currentOptions.splice(index, 1);
    handleChange("options", currentOptions);
  };

  // Condition Handlers
  const handleAddCondition = () => {
    const currentConds = data.conditions || [];
    const newCond = {
      id: `cond-${Date.now()}`,
      variable: "answer",
      operator: "equals" as const,
      value: "yes",
    };
    handleChange("conditions", [...currentConds, newCond]);
  };

  const handleUpdateCondition = (index: number, field: string, val: string) => {
    const currentConds = [...(data.conditions || [])];
    currentConds[index] = { ...currentConds[index], [field]: val };
    handleChange("conditions", currentConds);
  };

  const handleRemoveCondition = (index: number) => {
    const currentConds = [...(data.conditions || [])];
    currentConds.splice(index, 1);
    handleChange("conditions", currentConds);
  };

  return (
    <div className="w-80 border-l border-slate-200 bg-white h-full flex flex-col shadow-lg z-20 animate-fade-in shrink-0">
      {/* Drawer Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
            Node Settings: {nodeType}
          </span>
          <h3 className="text-sm font-bold text-slate-900 leading-tight">
            {data.label || `${nodeType.toUpperCase()} Node`}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Node Label */}
        <Input
          label="Node Title / Label"
          value={data.label || ""}
          onChange={(e) => handleChange("label", e.target.value)}
          placeholder="e.g. Welcome Message"
        />

        {/* 1. Start Node */}
        {nodeType === "start" && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900">
            <p className="font-semibold mb-1">Conversation Trigger</p>
            <p className="text-slate-600 text-[11px]">
              This is the entry point for visitor sessions. Connect this node to the first step in your flow.
            </p>
          </div>
        )}

        {/* 2. Message Node */}
        {nodeType === "message" && (
          <div className="space-y-3">
            <Textarea
              label="Message Text"
              value={data.messageText || ""}
              onChange={(e) => handleChange("messageText", e.target.value)}
              placeholder="Hi! Welcome to our website. You can use variables like {{name}}."
              rows={4}
            />

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Media Attachment (Optional)
              </label>
              <select
                value={data.mediaType || "none"}
                onChange={(e) => handleChange("mediaType", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-medium text-slate-800"
              >
                <option value="none">None</option>
                <option value="image">Image (JPG, PNG, GIF)</option>
                <option value="video">Video Embed (MP4, YouTube)</option>
                <option value="pdf">PDF Document</option>
              </select>
            </div>

            {data.mediaType && data.mediaType !== "none" && (
              <Input
                label="Media URL"
                value={data.mediaUrl || ""}
                onChange={(e) => handleChange("mediaUrl", e.target.value)}
                placeholder="https://example.com/image.jpg"
              />
            )}
          </div>
        )}

        {/* 3. Buttons / Quick Replies */}
        {nodeType === "buttons" && (
          <div className="space-y-3">
            <Textarea
              label="Prompt Message"
              value={data.messageText || ""}
              onChange={(e) => handleChange("messageText", e.target.value)}
              placeholder="Please choose one of the options below:"
              rows={2}
            />

            <Input
              label="Store Selection in Variable"
              value={data.inputKey || "choice"}
              onChange={(e) => handleChange("inputKey", e.target.value)}
              placeholder="choice"
            />

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Button Options
                </label>
                <Button size="sm" variant="outline" onClick={handleAddOption} className="h-7 text-xs">
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>

              <div className="space-y-2">
                {(data.options || []).map((opt, idx) => (
                  <div key={opt.id || idx} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-600">Option {idx + 1}</span>
                      <button
                        onClick={() => handleRemoveOption(idx)}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <Input
                      placeholder="Button Label (e.g. Book Demo)"
                      value={opt.label}
                      onChange={(e) => handleUpdateOption(idx, "label", e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 4. Input Form Node */}
        {nodeType === "input" && (
          <div className="space-y-3">
            <Textarea
              label="Question / Prompt"
              value={data.messageText || ""}
              onChange={(e) => handleChange("messageText", e.target.value)}
              placeholder="What is your email address?"
              rows={2}
            />

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Input Type
              </label>
              <select
                value={data.inputType || "text"}
                onChange={(e) => handleChange("inputType", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-medium text-slate-800"
              >
                <option value="name">Name</option>
                <option value="email">Email Address (Validates @)</option>
                <option value="phone">Phone Number (Validates digits)</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="text">Free Text</option>
              </select>
            </div>

            <Input
              label="Variable Name (Storage Key)"
              value={data.inputKey || "email"}
              onChange={(e) => handleChange("inputKey", e.target.value)}
              placeholder="e.g. email, company_name"
              helperText="Value will be available as {{key}} in subsequent nodes."
            />

            <Input
              label="Input Placeholder"
              value={data.inputPlaceholder || ""}
              onChange={(e) => handleChange("inputPlaceholder", e.target.value)}
              placeholder="e.g. you@company.com"
            />

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="required-toggle"
                checked={data.required ?? true}
                onChange={(e) => handleChange("required", e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="required-toggle" className="text-xs text-slate-700 font-medium">
                Mandatory / Required Field
              </label>
            </div>
          </div>
        )}

        {/* 5. Attachment Node */}
        {nodeType === "attachment" && (
          <div className="space-y-3">
            <Input
              label="Upload Prompt Message"
              value={data.uploadPrompt || ""}
              onChange={(e) => handleChange("uploadPrompt", e.target.value)}
              placeholder="Please upload a PDF or screenshot:"
            />

            <Input
              label="Variable Name (Key)"
              value={data.inputKey || "attachment"}
              onChange={(e) => handleChange("inputKey", e.target.value)}
              placeholder="attachment"
            />

            <Input
              label="Max File Size (MB)"
              type="number"
              value={data.maxSizeMb || 10}
              onChange={(e) => handleChange("maxSizeMb", Number(e.target.value))}
            />
          </div>
        )}

        {/* 6. Condition Node */}
        {nodeType === "condition" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                IF / ELSE Conditions
              </label>
              <Button size="sm" variant="outline" onClick={handleAddCondition} className="h-7 text-xs">
                <Plus className="w-3 h-3 mr-1" /> Add Rule
              </Button>
            </div>

            <div className="space-y-2">
              {(data.conditions || []).map((cond, idx) => (
                <div key={cond.id || idx} className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/50 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-900">Rule {idx + 1}</span>
                    <button onClick={() => handleRemoveCondition(idx)} className="text-slate-400 hover:text-rose-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <Input
                    label="Variable Name"
                    value={cond.variable}
                    onChange={(e) => handleUpdateCondition(idx, "variable", e.target.value)}
                    placeholder="choice"
                  />

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Operator</label>
                    <select
                      value={cond.operator}
                      onChange={(e) => handleUpdateCondition(idx, "operator", e.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white p-1.5 text-xs"
                    >
                      <option value="equals">Equals</option>
                      <option value="not_equals">Not Equals</option>
                      <option value="contains">Contains</option>
                      <option value="greater_than">Greater Than</option>
                      <option value="less_than">Less Than</option>
                      <option value="is_set">Is Set (Not empty)</option>
                    </select>
                  </div>

                  <Input
                    label="Value to Match"
                    value={cond.value}
                    onChange={(e) => handleUpdateCondition(idx, "value", e.target.value)}
                    placeholder="e.g. demo"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7. Webhook Node */}
        {nodeType === "webhook" && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                HTTP Method
              </label>
              <select
                value={data.webhookMethod || "POST"}
                onChange={(e) => handleChange("webhookMethod", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-medium"
              >
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
              </select>
            </div>

            <Input
              label="Endpoint URL"
              value={data.webhookUrl || ""}
              onChange={(e) => handleChange("webhookUrl", e.target.value)}
              placeholder="https://hooks.zapier.com/hooks/catch/..."
            />

            <Textarea
              label="Custom JSON Body (Optional)"
              value={data.webhookBody || ""}
              onChange={(e) => handleChange("webhookBody", e.target.value)}
              placeholder='{"name": "{{name}}", "email": "{{email}}"}'
              rows={3}
              helperText="If empty, sends all collected variables."
            />
          </div>
        )}

        {/* 8. AI Fallback Node */}
        {nodeType === "ai_fallback" && (
          <div className="space-y-3">
            <Textarea
              label="System Persona / Instructions"
              value={data.aiPrompt || ""}
              onChange={(e) => handleChange("aiPrompt", e.target.value)}
              placeholder="You are a helpful customer support agent for our company. Answer questions from our knowledge base."
              rows={3}
            />

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Fallback Action if AI Uncertain
              </label>
              <select
                value={data.fallbackAction || "handover"}
                onChange={(e) => handleChange("fallbackAction", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-medium"
              >
                <option value="handover">Route to Human Agent (Live Handover)</option>
                <option value="form">Show Contact Form</option>
                <option value="message">Display Polite Fallback Message</option>
              </select>
            </div>
          </div>
        )}

        {/* 9. Live Handover Node */}
        {nodeType === "handover" && (
          <div className="space-y-3">
            <Textarea
              label="Handover Message to Visitor"
              value={data.handoverMessage || ""}
              onChange={(e) => handleChange("handoverMessage", e.target.value)}
              placeholder="🔔 We are connecting you with a live specialist right now. Please hold on!"
              rows={3}
            />
          </div>
        )}

        {/* 10. Close Node */}
        {nodeType === "close" && (
          <div className="space-y-3">
            <Textarea
              label="Closing Message"
              value={data.closingMessage || ""}
              onChange={(e) => handleChange("closingMessage", e.target.value)}
              placeholder="🎉 Thank you for chatting with us! Have a wonderful day."
              rows={3}
            />

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="lead-notify-toggle"
                checked={data.triggerLeadNotification ?? true}
                onChange={(e) => handleChange("triggerLeadNotification", e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              <label htmlFor="lead-notify-toggle" className="text-xs text-slate-700 font-medium">
                Trigger New Lead Notification
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Drawer Footer / Delete */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
        {nodeType !== "start" ? (
          <Button
            size="sm"
            variant="danger"
            onClick={() => onDeleteNode(node.id)}
            className="w-full gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Node</span>
          </Button>
        ) : (
          <p className="text-[11px] text-slate-400 italic text-center w-full">Start node cannot be deleted</p>
        )}
      </div>
    </div>
  );
}
