# Fieldwork operator experience

## Users and job
Oil-field asset operators ask questions across inspections, repairs, rules, spills and human notes; they need evidence-backed answers and useful interactive representations without navigating a complex dashboard. Desktop and mobile are both primary. User explicitly prefers light theme and operator control.

## Confirmed constraints
Generative UI is central. Preserve a continuous conversation with private history, show real interactive results inline, and let operators deliberately open larger exploration views. Keep earlier results/context stable; text-only answers are valid. Save reusable views explicitly, with fresh parameterized backend reads and no reused narrative. Corrections and other writes are separate, explicit actions. Sample questions are minimum capabilities, never a fixed answer catalog.

This standalone React/Vite/TanStack/AI SDK/Hono prototype supports labelled synthetic records and a separate optional read-only adapter for the local challenge sample dataset. No actual app/API/shared-package change, real model, authentication, enterprise storage or write implementation is claimed. Voice should eventually share context and approvals; no decorative microphone.
