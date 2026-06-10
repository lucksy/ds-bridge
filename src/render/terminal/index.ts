// T1.7 — terminal renderer primitives barrel.
export {
	type BarChartItem,
	type BarChartOptions,
	renderBarChart,
} from "./bar-chart.js";
export { FULL_BLOCK, PARTIAL_BLOCKS, proportionalBar } from "./blocks.js";
export { type GaugeOptions, renderGauge } from "./gauge.js";
export {
	type MatrixOptions,
	type MatrixRow,
	type MatrixStatus,
	renderMatrix,
} from "./matrix.js";
export {
	type ColorOptions,
	type Severity,
	severityColor,
	shouldColor,
} from "./severity.js";
export { sparkline } from "./sparkline.js";
export { renderTable } from "./table.js";
