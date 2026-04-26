# LLM Reasoning Capabilities Design

## Goal

Keep LLM_REASONING_DEFAULT focused on effort-like reasoning ladders, make capability checks model-aware, and add separate non-effort controls for providers/models that expose thinking mode or token-budget semantics instead of effort.

## Decisions

1. LLM_REASONING_DEFAULT remains the shared ladder for models that accept discrete reasoning intensity controls.
2. Reasoning mapping becomes model-aware rather than provider-only.
3. Add a separate thinking-mode config for models that expose enabled/disabled style controls.
4. Add a separate thinking-budget config for models that expose numeric reasoning budgets.
5. Keep reasoning summary handling separate and only emit it when the current provider path supports it.

## Capability Model

- OpenAI: model-aware reasoning effort mapping.
- Anthropic: model-aware effort mapping.
- xAI chat models: reasoning effort mapping with the narrower low/high ladder supported by the installed SDK path.
- Google Gemini 3: map LLM_REASONING_DEFAULT to thinkingLevel.
- Google Gemini 2.5: ignore LLM_REASONING_DEFAULT and use the dedicated thinking budget config.
- DeepSeek and ZAI: ignore LLM_REASONING_DEFAULT and use the dedicated thinking mode config.
- OpenRouter: keep effort mapping on the provider surface because OpenRouter exposes reasoning.effort directly.

## New Config Surface

- LLM_THINKING_TYPE_DEFAULT: default, enabled, disabled.
- LLM_THINKING_BUDGET_DEFAULT: default, dynamic, off, or a non-negative integer token budget.

## Runtime Behavior

- Each execution attempt computes effort options and non-effort options from provider plus model.
- Unsupported controls are omitted rather than force-mapped.
- Existing retry logic remains the safety net when a provider rejects a control that looked compatible.

## Testing

- Add failing config tests for provider/model-specific reasoning attempts.
- Add failing config tests for thinking mode and thinking budget mapping.
- Re-run focused config and script tests after implementation.
