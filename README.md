## Установка

В папке `ComfyUI/custom_nodes`:

```bash
git clone https://github.com/Tapok5000/ComfyUI-GSEN
```

Или скачать [zip](https://github.com/Tapok5000/ComfyUI-GSEN/archive/refs/heads/main.zip) и распаковать в `custom_nodes/ComfyUI-GSEN`. Потом перезапустить ComfyUI.

ComfyUI 0.43.2 или новее.

## Модели

Krea2 One → ↗ Settings, справа от Save и Sound: ✅ модель есть в папках моделей ComfyUI; нет — ⬇️ скачивает её с Hugging Face в ту папку этого типа, где уже лежат остальные, и сверяет sha256.

## Обновление

Krea2 One → ↗ Settings → **Update**  Потом перезапустить ComfyUI и нажать Ctrl+F5.

Системные промты для LLM, своя папка на задачу:
- Generations IMG — `assets/prompts`
- Analysis IMG LLM — `assets/prompts/img_to_text`

Settings → Save → **zip** — скачать все через ZIP.
