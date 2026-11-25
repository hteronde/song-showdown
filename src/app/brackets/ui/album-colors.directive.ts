import { Directive, ElementRef, inject, Input, OnChanges, OnDestroy } from '@angular/core';

type RGB = [number, number, number];
type Oklab = [lightness: number, a: number, b: number];
interface Candidate { color: RGB; lab: Oklab; score: number; }

const minimumColorDistance = 0.10;

const artworkPalettes = new Map<string, Promise<Candidate[]>>();
const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

function toOklab(color: RGB): Oklab {
    const [red, green, blue] = color.map(linear);
    const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
    const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
    const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
    return [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    ];
}

function colorDistance(left: Oklab, right: Oklab): number {
    return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function chooseArtworkColors(urls: readonly string[], palettes: readonly Candidate[][]): Map<string, RGB> {
    const covers = urls.map((url, index) => ({ url, candidates: palettes[index] }))
        .filter(({ candidates }) => candidates.length > 0)
        // Covers with the strongest artwork color get first choice, independent of the image host's URL.
        .sort((left, right) => right.candidates[0].score - left.candidates[0].score);
    const colors = new Map<string, RGB>();
    const assigned: Oklab[] = [];
    for (const { url, candidates } of covers) {
        const strongest = candidates[0];
        const choices = candidates.map(candidate => ({
            candidate,
            distance: Math.min(Infinity, ...assigned.map(color => colorDistance(candidate.lab, color)))
        }));
        // A noticeably different secondary color is preferable when it is well represented in the cover.
        const distinct = choices.find(({ candidate, distance }) =>
            distance >= minimumColorDistance && candidate.score >= strongest.score * 0.4);
        const selected = distinct?.candidate ?? choices.reduce((best, choice) => {
            const score = ({ candidate, distance }: typeof choice) =>
                candidate.score * (0.25 + 0.75 * Math.min(1, distance / minimumColorDistance));
            return score(choice) > score(best) ? choice : best;
        }).candidate;
        assigned.push(selected.lab);
        colors.set(url, selected.color);
    }
    return colors;
}

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
            const color: RGB = [red, green, blue];
            return {color, lab: toOklab(color), score: Math.sqrt(count) * (0.2 + chroma / 255)};
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

        const colors = chooseArtworkColors(urls, palettes);
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
