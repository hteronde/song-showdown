import { Directive, ElementRef, inject, Input, OnChanges, OnDestroy } from '@angular/core';

type RGB = [number, number, number];
interface Candidate { color: RGB; score: number; }

const artworkPalettes = new Map<string, Promise<Candidate[]>>();
const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

async function sampleArtwork(url: string): Promise<Candidate[]> {
    try {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.referrerPolicy = 'no-referrer';
        image.src = url;
        await image.decode();

        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const context = canvas.getContext('2d');
        if (!context) return [];
        context.drawImage(image, 0, 0, 32, 32);

        const pixels = context.getImageData(0, 0, 32, 32).data;
        const buckets = new Map<number, {count: number; total: RGB}>();
        for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] < 192) continue;
            const red = pixels[i], green = pixels[i + 1], blue = pixels[i + 2];
            const key = ((red >> 5) << 6) | ((green >> 5) << 3) | (blue >> 5);
            const bucket = buckets.get(key) ?? {count: 0, total: [0, 0, 0]};
            bucket.count++;
            bucket.total[0] += red;
            bucket.total[1] += green;
            bucket.total[2] += blue;
            buckets.set(key, bucket);
        }

        return [...buckets.values()].filter(bucket => bucket.count >= 8).map(({count, total}) => {
            const [red, green, blue] = total.map(channel => Math.round(channel / count));
            const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
            // Recognizable cover accents can outrank large neutral or subdued backgrounds.
            return {color: [red, green, blue] as RGB, score: Math.sqrt(count) * (0.2 + chroma / 255)};
        }).sort((a, b) => b.score - a.score).slice(0, 12);
    } catch {
        return [];
    }
}

function paletteFor(url: string): Promise<Candidate[]> {
    let pending = artworkPalettes.get(url);
    if (!pending) {
        pending = sampleArtwork(url);
        artworkPalettes.set(url, pending);
    }
    return pending;
}

@Directive({selector: '[appBracketAlbumPalette]', standalone: true, exportAs: 'bracketAlbumPalette'})
export class BracketAlbumPaletteDirective implements OnChanges {
    @Input() appBracketAlbumPalette: readonly (string | null)[] = [];
    private readonly listeners = new Map<string, Set<(color: RGB | undefined) => void>>();
    private colors = new Map<string, RGB>();
    private artworkKey = '';
    private revision = 0;

    async ngOnChanges(): Promise<void> {
        const urls = [...new Set(this.appBracketAlbumPalette.filter((url): url is string => !!url))].sort();
        const key = JSON.stringify(urls);
        if (key === this.artworkKey) return;
        this.artworkKey = key;
        const revision = ++this.revision;
        const palettes = await Promise.all(urls.map(paletteFor));
        if (revision !== this.revision) return;

        const colors = new Map<string, RGB>();
        for (const [index, url] of urls.entries()) {
            const candidates = palettes[index];
            if (!candidates.length) continue;
            const prior = [...colors.values()];
            const score = ({color, score}: Candidate): number => {
                const distance = Math.min(95, ...prior.map(other => Math.hypot(
                    color[0] - other[0], color[1] - other[1], color[2] - other[2]
                )));
                return score * (0.3 + 0.7 * distance / 95);
            };
            const primary = candidates.reduce((best, candidate) => score(candidate) > score(best) ? candidate : best);
            colors.set(url, primary.color);
        }
        this.colors = colors;
        for (const [url, callbacks] of this.listeners) {
            for (const callback of callbacks) callback(colors.get(url));
        }
    }

    subscribe(url: string, callback: (color: RGB | undefined) => void): () => void {
        const callbacks = this.listeners.get(url) ?? new Set();
        callbacks.add(callback);
        this.listeners.set(url, callbacks);
        callback(this.colors.get(url));
        return () => {
            callbacks.delete(callback);
            if (!callbacks.size) this.listeners.delete(url);
        };
    }
}

@Directive({selector: '[appAlbumColors]', standalone: true})
export class AlbumColorsDirective implements OnChanges, OnDestroy {
    @Input() appAlbumColors?: string | null;
    private readonly palette = inject(BracketAlbumPaletteDirective, {skipSelf: true});
    private unsubscribe?: () => void;

    constructor(private readonly element: ElementRef<HTMLElement>) {}

    ngOnChanges(): void {
        this.unsubscribe?.();
        this.applyColor(undefined);
        this.unsubscribe = this.appAlbumColors
            ? this.palette.subscribe(this.appAlbumColors, color => this.applyColor(color))
            : undefined;
    }

    ngOnDestroy(): void {
        this.unsubscribe?.();
    }

    private applyColor(color: RGB | undefined): void {
        const {style} = this.element.nativeElement;
        if (!color) {
            style.removeProperty('--song-box-fill');
            style.removeProperty('--song-box-text');
            return;
        }
        const [red, green, blue] = color;
        const luminance = 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
        style.setProperty('--song-box-fill', `rgb(${red}, ${green}, ${blue})`);
        style.setProperty('--song-box-text', luminance > 0.179 ? '#000' : '#fff');
    }
}
