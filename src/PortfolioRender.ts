/* ---- Portfolio image definition ---- */
export type PortfolioImage = {
  id: number;
  url: string;
  caption: string;
};

/* ---- Pick an image from the device ---- */
let nextImageId = 1; // simple numeric ID generator

export async function pickPortfolioImage(): Promise<PortfolioImage | null> {
  const file = await pickImageFile();
  if (!file) return null;

  const url = URL.createObjectURL(file);
  const caption = prompt('Enter caption for this image:') || 'Untitled';

  return {
    id: nextImageId++,
    url,
    caption
  };
}

/* ---- Helper: open file picker for images ---- */
function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';

    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      resolve(file);
      document.body.removeChild(input);
    };

    document.body.appendChild(input);
    input.click();
  });
}
