export interface WheelColor {
  hue: number;
  saturation: number;
  brightness: number;
}

export function hexToWheelColor(hex: string): WheelColor {
  const [red, green, blue] = [1, 3, 5].map(
    (index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255,
  );
  const brightness = Math.max(red, green, blue);
  const difference = brightness - Math.min(red, green, blue);
  let hue = 0;
  if (difference) {
    if (brightness === red) hue = (green - blue) / difference;
    else if (brightness === green) hue = (blue - red) / difference + 2;
    else hue = (red - green) / difference + 4;
  }
  return {
    hue: (60 * hue + 360) % 360,
    saturation: brightness === 0 ? 0 : difference / brightness,
    brightness,
  };
}

export function wheelColorToHex({ hue, saturation, brightness }: WheelColor) {
  const channels = [5, 3, 1].map((offset) => {
    const sector = (hue / 60 + offset) % 6;
    const blend = Math.max(0, Math.min(sector, 4 - sector, 1));
    return Math.round(255 * brightness * (1 - saturation * blend))
      .toString(16)
      .padStart(2, '0');
  });
  return `#${channels.join('').toUpperCase()}`;
}
