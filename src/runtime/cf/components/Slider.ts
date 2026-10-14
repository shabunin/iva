import { Container } from 'pixi.js';
import { CFNode } from '../parser';
import { CFRenderer } from '../renderer';
import { renderSliderOrGauge } from './SliderGauge';

export function renderSlider(
    node: CFNode,
    container: Container,
    renderer: CFRenderer,
    getNormJoin: (type: string, j: string | undefined) => string | null
) {
    renderSliderOrGauge(node, container, renderer, getNormJoin);
}
