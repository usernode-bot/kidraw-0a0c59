# Kidraw app icon

`brand/icon.png` is the home screen tile: 512 × 512, opaque, 128 KB.

- **Glyph:** Lucide `paintbrush` (ISC licence), unchanged, drawn white with
  2 px round strokes on the 24-unit grid, scaled ×12 at `translate(112 112)`.
- **Background:** the teal diagonal gradient `#34D3C3` to `#0B7D84`, with the
  platform's faint top-left white gloss and a drop shadow on the glyph group.

To re-render, take the SVG template from the platform conventions ("Icon
style: one set on the home screen") with the teal stops and the paintbrush
elements above, then run:

```sh
rsvg-convert -w 512 -h 512 icon.svg -o brand/icon.png
```
