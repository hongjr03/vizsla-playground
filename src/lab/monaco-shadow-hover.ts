import type * as Monaco from "monaco-editor";

const HOVER_DELAY_MS = 260;
const HOVER_HIDE_DELAY_MS = 220;
const HOVER_START_MODE_IMMEDIATE = 1;
const HOVER_START_SOURCE_KEYBOARD = 1;

interface HoverBridgeOptions {
  monaco: typeof Monaco;
  editor: Monaco.editor.IStandaloneCodeEditor;
  root: { elementFromPoint(x: number, y: number): Element | null };
  ownsModel(model: Monaco.editor.ITextModel): boolean;
}

interface ContentHoverController {
  shouldKeepOpenOnEditorMouseMoveOrLeave?: boolean;
  _contentWidget?: ContentHoverWidgetWrapper;
  showContentHover(range: Monaco.Range, mode: number, source: number, focus: boolean): void;
}

interface ContentHoverWidgetWrapper {
  getDomNode(): HTMLElement;
  hide(): void;
  isVisible?: boolean;
}

export function installShadowDomHoverBridge(options: HoverBridgeOptions): Monaco.IDisposable {
  let showTimer: number | undefined;
  let hideTimer: number | undefined;
  let lastPoint: { x: number; y: number } | undefined;

  const clearShowTimer = () => {
    if (showTimer !== undefined) {
      window.clearTimeout(showTimer);
      showTimer = undefined;
    }
  };

  const clearHideTimer = () => {
    if (hideTimer !== undefined) {
      window.clearTimeout(hideTimer);
      hideTimer = undefined;
    }
  };

  const controller = (): ContentHoverController | null =>
    options.editor.getContribution("editor.contrib.contentHover") as ContentHoverController | null;

  const contentHoverWidget = (): ContentHoverWidgetWrapper | null => controller()?._contentWidget ?? null;

  const setNativeHoverKeepOpen = (keepOpen: boolean) => {
    const contentHoverController = controller();
    if (contentHoverController) {
      contentHoverController.shouldKeepOpenOnEditorMouseMoveOrLeave = keepOpen;
    }
  };

  const pointInsideEditor = (point: { x: number; y: number } | undefined): boolean => {
    if (!point) {
      return false;
    }
    const editorDom = options.editor.getDomNode();
    if (!editorDom) {
      return false;
    }
    const rect = editorDom.getBoundingClientRect();
    if (point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom) {
      return false;
    }
    const topElement = options.root.elementFromPoint(point.x, point.y);
    return topElement !== null && editorDom.contains(topElement);
  };

  const pointInsideElement = (point: { x: number; y: number } | undefined, element: HTMLElement | null): boolean => {
    if (!point || !element) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    if (point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom) {
      return false;
    }
    const topElement = options.root.elementFromPoint(point.x, point.y);
    return topElement !== null && element.contains(topElement);
  };

  const pointInsideHover = (point: { x: number; y: number } | undefined): boolean =>
    pointInsideElement(point, contentHoverWidget()?.getDomNode() ?? null);

  const pointInsideInteractiveArea = (point: { x: number; y: number } | undefined): boolean =>
    pointInsideEditor(point) || pointInsideHover(point);

  const hideHover = () => {
    contentHoverWidget()?.hide();
    setNativeHoverKeepOpen(false);
  };

  const scheduleHideIfOutsideInteractiveArea = (point: { x: number; y: number }) => {
    if (pointInsideEditor(point) || pointInsideHover(point)) {
      clearHideTimer();
      setNativeHoverKeepOpen(true);
      return;
    }

    clearHideTimer();
    hideTimer = window.setTimeout(() => {
      hideTimer = undefined;
      if (!pointInsideInteractiveArea(lastPoint)) {
        hideHover();
      }
    }, HOVER_HIDE_DELAY_MS);
  };

  const document = options.editor.getDomNode()?.ownerDocument ?? globalThis.document;
  const documentMouseMove = (event: MouseEvent) => {
    const point = { x: event.clientX, y: event.clientY };
    lastPoint = point;
    if (contentHoverWidget()?.isVisible) {
      scheduleHideIfOutsideInteractiveArea(point);
    }
  };
  document.addEventListener("mousemove", documentMouseMove, true);

  const mouseMove = options.editor.onMouseMove((event) => {
    lastPoint = { x: event.event.posx, y: event.event.posy };
    if (event.target.type !== options.monaco.editor.MouseTargetType.CONTENT_TEXT || !event.target.range) {
      if (!contentHoverWidget()?.isVisible) {
        clearShowTimer();
      }
      return;
    }

    const model = options.editor.getModel();
    if (!model || !options.ownsModel(model)) {
      clearShowTimer();
      return;
    }

    const range = event.target.range;
    clearShowTimer();
    clearHideTimer();
    setNativeHoverKeepOpen(true);
    showTimer = window.setTimeout(() => {
      showTimer = undefined;
      if (!pointInsideInteractiveArea(lastPoint)) {
        setNativeHoverKeepOpen(false);
        return;
      }

      const contentHoverController = controller();
      setNativeHoverKeepOpen(true);
      contentHoverController?.showContentHover(range, HOVER_START_MODE_IMMEDIATE, HOVER_START_SOURCE_KEYBOARD, false);
    }, HOVER_DELAY_MS);
  });

  const mouseLeave = options.editor.onMouseLeave((event) => {
    const point = { x: event.event.posx, y: event.event.posy };
    lastPoint = point;
    if (!pointInsideHover(point)) {
      if (contentHoverWidget()?.isVisible) {
        scheduleHideIfOutsideInteractiveArea(point);
      } else if (showTimer === undefined && !pointInsideEditor(point)) {
        setNativeHoverKeepOpen(false);
      }
    }
  });

  return {
    dispose() {
      clearShowTimer();
      clearHideTimer();
      document.removeEventListener("mousemove", documentMouseMove, true);
      setNativeHoverKeepOpen(false);
      mouseMove.dispose();
      mouseLeave.dispose();
    },
  };
}
