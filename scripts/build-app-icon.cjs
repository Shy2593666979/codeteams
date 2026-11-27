// Render the vector source at each Windows icon size, without adding an image dependency.
const { app, BrowserWindow } = require("electron");
const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

app.whenReady().then(async () => {
  const root = resolve(__dirname, "../apps/desktop/resources");
  const svg = readFileSync(resolve(root, "app-icon.svg"), "utf8");
  const sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256, 512];
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  try {
    await window.loadURL("data:text/html,<html><body></body></html>");
    const frames = await window.webContents.executeJavaScript(`(async () => {
      const image = new Image();
      image.src = ${JSON.stringify("data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"))};
      await image.decode();
      return ${JSON.stringify(sizes)}.map(size => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, size, size);
        // The approved app icon has no background tile. Check before overwriting assets.
        if (size >= 32) {
          const alpha = context.getImageData(Math.floor(size / 2), Math.floor(size * .05), 1, 1).data[3];
          if (alpha !== 0) throw new Error('App icon must have a transparent background; remove the backing tile from app-icon.svg.');
        }
        return { size, png: canvas.toDataURL('image/png').split(',')[1] };
      });
    })()`);
    writeFileSync(resolve(root, "app-icon.png"), Buffer.from(frames.find(frame => frame.size === 512).png, "base64"));
    const icoFrames = frames.filter(frame => frame.size <= 256);
    const header = Buffer.alloc(6 + icoFrames.length * 16);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(icoFrames.length, 4);
    let offset = header.length;
    const buffers = icoFrames.map((frame, index) => {
      const png = Buffer.from(frame.png, "base64");
      const entry = 6 + index * 16;
      header[entry] = header[entry + 1] = frame.size === 256 ? 0 : frame.size;
      header.writeUInt16LE(1, entry + 4);
      header.writeUInt16LE(32, entry + 6);
      header.writeUInt32LE(png.length, entry + 8);
      header.writeUInt32LE(offset, entry + 12);
      offset += png.length;
      return png;
    });
    writeFileSync(resolve(root, "app-icon.ico"), Buffer.concat([header, ...buffers]));
    console.log(`Generated app-icon.png and app-icon.ico (${icoFrames.map(frame => frame.size).join(", ")}px)`);
  } finally {
    window.destroy();
    app.quit();
  }
}).catch(error => { console.error(error); app.exit(1); });
