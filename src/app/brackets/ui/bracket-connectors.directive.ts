import { AfterViewChecked, Directive, ElementRef, Input, OnDestroy } from '@angular/core';

interface BracketLink { matchupId: number; nextMatchupId: number | null; drawPending?: boolean; }

/** Draw in board coordinates without a tall SVG viewport that can clip long brackets. */
@Directive({ selector: '[appBracketConnectors]', standalone: true })
export class BracketConnectorsDirective implements AfterViewChecked, OnDestroy {
  @Input() appBracketConnectors: BracketLink[] = [];
  private observer?: ResizeObserver;
  private frame: number | null = null;
  private signature = '';
  constructor(private readonly element: ElementRef<HTMLElement>) {
    Object.assign(element.nativeElement.style, { position: 'absolute', top: '0', left: '0', width: '0', height: '0', overflow: 'visible', pointerEvents: 'none', zIndex: '0' });
    element.nativeElement.setAttribute('aria-hidden', 'true');
  }
  ngAfterViewChecked(): void {
    const board = this.element.nativeElement.parentElement;
    if (!board) return;
    if (!this.observer) {
      this.observer = new ResizeObserver(() => this.schedule());
      this.observer.observe(board);
    }
    this.schedule();
  }
  private schedule(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => { this.frame = null; this.draw(); });
  }
  private draw(): void {
    const host = this.element.nativeElement, board = host.parentElement;
    if (!board) return;
    const bounds = board.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const boxes = new Map(Array.from(board.querySelectorAll<HTMLElement>('[data-matchup-id]'), node => [Number(node.dataset['matchupId']), node.getBoundingClientRect()]));
    const byId = new Map(this.appBracketConnectors.map(match => [match.matchupId, match]));
    const paths = this.appBracketConnectors.flatMap(match => {
      const from = boxes.get(match.matchupId), to = match.nextMatchupId == null ? undefined : boxes.get(match.nextMatchupId);
      if (!from || !to) return [];
      return [{ x1: from.right - bounds.left + board.scrollLeft, y1: (from.top + from.bottom) / 2 - bounds.top + board.scrollTop,
        x2: to.left - bounds.left + board.scrollLeft, y2: (to.top + to.bottom) / 2 - bounds.top + board.scrollTop,
        pending: !!byId.get(match.nextMatchupId!)?.drawPending }];
    });
    const signature = JSON.stringify(paths);
    if (signature === this.signature) return;
    this.signature = signature;
    const fragment = document.createDocumentFragment();
    for (const path of paths) {
      const middle = (path.x1 + path.x2) / 2;
      const border = `1px ${path.pending ? 'dashed' : 'solid'} ${path.pending ? '#c7b8a8' : '#c7c2b5'}`;
      for (const [left, top, width, height, vertical] of [
        [path.x1, path.y1, middle - path.x1, 0, false],
        [middle, Math.min(path.y1, path.y2), 0, Math.abs(path.y2 - path.y1), true],
        [middle, path.y2, path.x2 - middle, 0, false]
      ] as Array<[number, number, number, number, boolean]>) {
        const line = document.createElement('span');
        Object.assign(line.style, { position: 'absolute', left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, boxSizing: 'border-box', [vertical ? 'borderLeft' : 'borderTop']: border });
        fragment.appendChild(line);
      }
    }
    host.replaceChildren(fragment);
  }
  ngOnDestroy(): void { this.observer?.disconnect(); if (this.frame !== null) cancelAnimationFrame(this.frame); }
}
