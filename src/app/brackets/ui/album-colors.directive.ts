import { Directive, ElementRef, Input, OnChanges } from '@angular/core';

interface AlbumColors {
    fill: string;
    text: string;
}

const albumColors = new Map<string, Promise<AlbumColors | null>>();
const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

async function sampleArtwork(url: string): Promise<AlbumColors | null> {
    try {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.referrerPolicy = 'no-referrer';
        image.src = url;
        await image.decode();

        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const context = canvas.getContext('2d');
        if (!context) return null;
        context.drawImage(image, 0, 0, 32, 32);

        const pixels = context.getImageData(0, 0, 32, 32).data;
        const buckets = new Map<number, {count: number; red: number; green: number; blue: number}>();
        for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] < 192) continue;
            const red = pixels[i], green = pixels[i + 1], blue = pixels[i + 2];
            const key = ((red >> 5) << 6) | ((green >> 5) << 3) | (blue >> 5);
            const bucket = buckets.get(key) ?? {count: 0, red: 0, green: 0, blue: 0};
            bucket.count++;
            bucket.red += red;
            bucket.green += green;
            bucket.blue += blue;
            buckets.set(key, bucket);
        }

        const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
        if (!dominant) return null;
        const red = Math.round(dominant.red / dominant.count);
        const green = Math.round(dominant.green / dominant.count);
        const blue = Math.round(dominant.blue / dominant.count);
        const luminance = 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
        return {fill: `rgb(${red}, ${green}, ${blue})`, text: luminance > 0.179 ? '#000' : '#fff'};
    } catch {
        return null;
    }
}

@Directive({selector: '[appAlbumColors]', standalone: true})
export class AlbumColorsDirective implements OnChanges {
    @Input() appAlbumColors?: string | null;

    constructor(private readonly element: ElementRef<HTMLElement>) {}

    async ngOnChanges(): Promise<void> {
        const url = this.appAlbumColors;
        const {style} = this.element.nativeElement;
        style.removeProperty('--song-box-fill');
        style.removeProperty('--song-box-text');
        if (!url) return;

        let colors = albumColors.get(url);
        if (!colors) {
            colors = sampleArtwork(url);
            albumColors.set(url, colors);
        }
        const result = await colors;
        if (!result || this.appAlbumColors !== url) return;
        style.setProperty('--song-box-fill', result.fill);
        style.setProperty('--song-box-text', result.text);
    }
}
