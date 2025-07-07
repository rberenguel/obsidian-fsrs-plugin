/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/ts-fsrs@5.2.0/dist/index.mjs
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var t = ((t) => (
		(t[(t.New = 0)] = "New"),
		(t[(t.Learning = 1)] = "Learning"),
		(t[(t.Review = 2)] = "Review"),
		(t[(t.Relearning = 3)] = "Relearning"),
		t
	))(t || {}),
	e = ((t) => (
		(t[(t.Manual = 0)] = "Manual"),
		(t[(t.Again = 1)] = "Again"),
		(t[(t.Hard = 2)] = "Hard"),
		(t[(t.Good = 3)] = "Good"),
		(t[(t.Easy = 4)] = "Easy"),
		t
	))(e || {});
class i {
	static card(t) {
		return {
			...t,
			state: i.state(t.state),
			due: i.time(t.due),
			last_review: t.last_review ? i.time(t.last_review) : void 0,
		};
	}
	static rating(t) {
		if (typeof t == "string") {
			const i = t.charAt(0).toUpperCase(),
				s = t.slice(1).toLowerCase(),
				a = e[`${i}${s}`];
			if (a === void 0) throw new Error(`Invalid rating:[${t}]`);
			return a;
		} else if (typeof t == "number") return t;
		throw new Error(`Invalid rating:[${t}]`);
	}
	static state(e) {
		if (typeof e == "string") {
			const i = e.charAt(0).toUpperCase(),
				s = e.slice(1).toLowerCase(),
				a = t[`${i}${s}`];
			if (a === void 0) throw new Error(`Invalid state:[${e}]`);
			return a;
		} else if (typeof e == "number") return e;
		throw new Error(`Invalid state:[${e}]`);
	}
	static time(t) {
		if (typeof t == "object" && t instanceof Date) return t;
		if (typeof t == "string") {
			const e = Date.parse(t);
			if (isNaN(e)) throw new Error(`Invalid date:[${t}]`);
			return new Date(e);
		} else if (typeof t == "number") return new Date(t);
		throw new Error(`Invalid date:[${t}]`);
	}
	static review_log(t) {
		return {
			...t,
			due: i.time(t.due),
			rating: i.rating(t.rating),
			state: i.state(t.state),
			review: i.time(t.review),
		};
	}
}
(Date.prototype.scheduler = function (t, e) {
	return s(this, t, e);
}),
	(Date.prototype.diff = function (t, e) {
		return a(this, t, e);
	}),
	(Date.prototype.format = function () {
		return r(this);
	}),
	(Date.prototype.dueFormat = function (t, e, i) {
		return o(this, t, e, i);
	});
function s(t, e, s) {
	return new Date(
		s
			? i.time(t).getTime() + e * 24 * 60 * 60 * 1e3
			: i.time(t).getTime() + e * 60 * 1e3,
	);
}
function a(t, e, s) {
	if (!t || !e) throw new Error("Invalid date");
	const a = i.time(t).getTime() - i.time(e).getTime();
	let r = 0;
	switch (s) {
		case "days":
			r = Math.floor(a / (24 * 60 * 60 * 1e3));
			break;
		case "minutes":
			r = Math.floor(a / (60 * 1e3));
			break;
	}
	return r;
}
function r(t) {
	const e = i.time(t),
		s = e.getFullYear(),
		a = e.getMonth() + 1,
		r = e.getDate(),
		l = e.getHours(),
		d = e.getMinutes(),
		o = e.getSeconds();
	return `${s}-${n(a)}-${n(r)} ${n(l)}:${n(d)}:${n(o)}`;
}
function n(t) {
	return t < 10 ? `0${t}` : `${t}`;
}
const l = [60, 60, 24, 31, 12],
	d = ["second", "min", "hour", "day", "month", "year"];
function o(t, e, s, a = d) {
	(t = i.time(t)), (e = i.time(e)), a.length !== d.length && (a = d);
	let r = t.getTime() - e.getTime(),
		n;
	for (r /= 1e3, n = 0; n < l.length && !(r < l[n]); n++) r /= l[n];
	return `${Math.floor(r)}${s ? a[n] : ""}`;
}
function h(t) {
	return i.time(t);
}
function u(t) {
	return i.state(t);
}
function c(t) {
	return i.rating(t);
}
const _ = Object.freeze([e.Again, e.Hard, e.Good, e.Easy]),
	f = [
		{ start: 2.5, end: 7, factor: 0.15 },
		{ start: 7, end: 20, factor: 0.1 },
		{ start: 20, end: 1 / 0, factor: 0.05 },
	];
function g(t, e, i) {
	let s = 1;
	for (const e of f)
		s += e.factor * Math.max(Math.min(t, e.end) - e.start, 0);
	t = Math.min(t, i);
	let a = Math.max(2, Math.round(t - s));
	const r = Math.min(Math.round(t + s), i);
	return (
		t > e && (a = Math.max(a, e + 1)),
		(a = Math.min(a, r)),
		{ min_ivl: a, max_ivl: r }
	);
}
function y(t, e, i) {
	return Math.min(Math.max(t, e), i);
}
function m(t, e) {
	const i = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()),
		s = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate());
	return Math.floor((s - i) / 864e5);
}
const p = "5.2.0",
	w = 0.9,
	v = 36500,
	x = !1,
	b = !0,
	M = Object.freeze(["1m", "10m"]),
	S = Object.freeze(["10m"]),
	E = `v${p} using FSRS-6.0`,
	R = 0.001,
	F = 36500,
	A = 100,
	L = 0.5,
	N = 0.1542,
	$ = Object.freeze([
		0.212,
		1.2931,
		2.3065,
		8.2956,
		6.4133,
		0.8334,
		3.0194,
		0.001,
		1.8722,
		0.1666,
		0.796,
		1.4835,
		0.0614,
		0.2629,
		1.6483,
		0.6014,
		1.8729,
		0.5425,
		0.0912,
		0.0658,
		N,
	]),
	D = 2,
	I = (t) => [
		[R, A],
		[R, A],
		[R, A],
		[R, A],
		[1, 10],
		[0.001, 4],
		[0.001, 4],
		[0.001, 0.75],
		[0, 4.5],
		[0, 0.8],
		[0.001, 3.5],
		[0.001, 5],
		[0.001, 0.25],
		[0.001, 0.9],
		[0, 4],
		[0, 1],
		[1, 6],
		[0, t],
		[0, t],
		[0, 0.8],
		[0.1, 0.8],
	],
	H = (t, e) => {
		let i = D;
		if (Math.max(0, e) > 1) {
			const s =
				-(
					Math.log(t[11]) +
					Math.log(Math.pow(2, t[13]) - 1) +
					t[14] * 0.3
				) / e;
			i = y(+s.toFixed(8), 0.01, 2);
		}
		return I(i).map(([e, i], s) => y(t[s], e, i));
	},
	C = (t) => {
		if (t.find((t) => !isFinite(t) && !isNaN(t)) !== void 0)
			throw Error(`Non-finite or NaN value in parameters ${t}`);
		if (![17, 19, 21].includes(t.length))
			throw Error(
				`Invalid parameter length: ${t.length}. Must be 17, 19 or 21 for FSRSv4, 5 and 6 respectively.`,
			);
		return t;
	},
	T = (t) => {
		if (t === void 0) return [...$];
		switch (t.length) {
			case 21:
				return [...t];
			case 19:
				return (
					console.debug("[FSRS-6]auto fill w from 19 to 21 length"),
					[...t, 0, L]
				);
			case 17: {
				const e = [...t];
				return (
					(e[4] = +(e[5] * 2 + e[4]).toFixed(8)),
					(e[5] = +(Math.log(e[5] * 3 + 1) / 3).toFixed(8)),
					(e[6] = +(e[6] + 0.5).toFixed(8)),
					console.debug("[FSRS-6]auto fill w from 17 to 21 length"),
					e.concat([0, 0, 0, L])
				);
			}
			default:
				return (
					console.warn(
						"[FSRS]Invalid parameters length, using default parameters",
					),
					[...$]
				);
		}
	},
	G = (t) => {
		const e = Array.isArray(t?.learning_steps) ? t.learning_steps : M,
			i = Array.isArray(t?.relearning_steps) ? t.relearning_steps : S,
			s = H(T(t?.w), i.length);
		return {
			request_retention: t?.request_retention || w,
			maximum_interval: t?.maximum_interval || v,
			w: s,
			enable_fuzz: t?.enable_fuzz ?? x,
			enable_short_term: t?.enable_short_term ?? b,
			learning_steps: e,
			relearning_steps: i,
		};
	};
function z(e, s) {
	const a = {
		due: e ? i.time(e) : new Date(),
		stability: 0,
		difficulty: 0,
		elapsed_days: 0,
		scheduled_days: 0,
		reps: 0,
		lapses: 0,
		learning_steps: 0,
		state: t.New,
		last_review: void 0,
	};
	return s && typeof s == "function" ? s(a) : a;
}
class U {
	c;
	s0;
	s1;
	s2;
	constructor(t) {
		const e = k();
		(this.c = 1),
			(this.s0 = e(" ")),
			(this.s1 = e(" ")),
			(this.s2 = e(" ")),
			t == null && (t = +new Date()),
			(this.s0 -= e(t)),
			this.s0 < 0 && (this.s0 += 1),
			(this.s1 -= e(t)),
			this.s1 < 0 && (this.s1 += 1),
			(this.s2 -= e(t)),
			this.s2 < 0 && (this.s2 += 1);
	}
	next() {
		const t = 2091639 * this.s0 + this.c * 2.3283064365386963e-10;
		return (
			(this.s0 = this.s1),
			(this.s1 = this.s2),
			(this.s2 = t - (this.c = t | 0)),
			this.s2
		);
	}
	set state(t) {
		(this.c = t.c), (this.s0 = t.s0), (this.s1 = t.s1), (this.s2 = t.s2);
	}
	get state() {
		return { c: this.c, s0: this.s0, s1: this.s1, s2: this.s2 };
	}
}
function k() {
	let t = 4022871197;
	return function (e) {
		e = String(e);
		for (let i = 0; i < e.length; i++) {
			t += e.charCodeAt(i);
			let s = 0.02519603282416938 * t;
			(t = s >>> 0),
				(s -= t),
				(s *= t),
				(t = s >>> 0),
				(s -= t),
				(t += s * 4294967296);
		}
		return (t >>> 0) * 2.3283064365386963e-10;
	};
}
function q(t) {
	const e = new U(t),
		i = () => e.next();
	return (
		(i.int32 = () => (e.next() * 4294967296) | 0),
		(i.double = () => i() + ((i() * 2097152) | 0) * 11102230246251565e-32),
		(i.state = () => e.state),
		(i.importState = (t) => ((e.state = t), i)),
		i
	);
}
const P = (t) => {
	const e = typeof t == "number" ? -t : -t[20],
		i = Math.exp(Math.pow(e, -1) * Math.log(0.9)) - 1;
	return { decay: e, factor: +i.toFixed(8) };
};
function j(t, e, i) {
	const { decay: s, factor: a } = P(t);
	return +Math.pow(1 + (a * e) / i, s).toFixed(8);
}
class O {
	param;
	intervalModifier;
	_seed;
	constructor(t) {
		(this.param = new Proxy(G(t), this.params_handler_proxy())),
			(this.intervalModifier = this.calculate_interval_modifier(
				this.param.request_retention,
			)),
			(this.forgetting_curve = j.bind(this, this.param.w));
	}
	get interval_modifier() {
		return this.intervalModifier;
	}
	set seed(t) {
		this._seed = t;
	}
	calculate_interval_modifier(t) {
		if (t <= 0 || t > 1)
			throw new Error(
				"Requested retention rate should be in the range (0,1]",
			);
		const { decay: e, factor: i } = P(this.param.w);
		return +((Math.pow(t, 1 / e) - 1) / i).toFixed(8);
	}
	get parameters() {
		return this.param;
	}
	set parameters(t) {
		this.update_parameters(t);
	}
	params_handler_proxy() {
		const t = this;
		return {
			set: function (e, i, s) {
				return (
					i === "request_retention" && Number.isFinite(s)
						? (t.intervalModifier = t.calculate_interval_modifier(
								Number(s),
							))
						: i === "w" &&
							((s = H(T(s), e.relearning_steps.length)),
							(t.forgetting_curve = j.bind(this, s)),
							(t.intervalModifier = t.calculate_interval_modifier(
								Number(e.request_retention),
							))),
					Reflect.set(e, i, s),
					!0
				);
			},
		};
	}
	update_parameters(t) {
		const e = G(t);
		for (const t in e)
			if (t in this.param) {
				const i = t;
				this.param[i] = e[i];
			}
	}
	init_stability(t) {
		return Math.max(this.param.w[t - 1], 0.1);
	}
	init_difficulty(t) {
		return +(
			this.param.w[4] -
			Math.exp((t - 1) * this.param.w[5]) +
			1
		).toFixed(8);
	}
	apply_fuzz(t, e) {
		if (!this.param.enable_fuzz || t < 2.5) return Math.round(t);
		const i = q(this._seed)(),
			{ min_ivl: s, max_ivl: a } = g(t, e, this.param.maximum_interval);
		return Math.floor(i * (a - s + 1) + s);
	}
	next_interval(t, e) {
		const i = Math.min(
			Math.max(1, Math.round(t * this.intervalModifier)),
			this.param.maximum_interval,
		);
		return this.apply_fuzz(i, e);
	}
	linear_damping(t, e) {
		return +((t * (10 - e)) / 9).toFixed(8);
	}
	next_difficulty(t, i) {
		const s = -this.param.w[6] * (i - 3),
			a = t + this.linear_damping(s, t);
		return y(this.mean_reversion(this.init_difficulty(e.Easy), a), 1, 10);
	}
	mean_reversion(t, e) {
		return +(this.param.w[7] * t + (1 - this.param.w[7]) * e).toFixed(8);
	}
	next_recall_stability(t, i, s, a) {
		const r = e.Hard === a ? this.param.w[15] : 1,
			n = e.Easy === a ? this.param.w[16] : 1;
		return +y(
			i *
				(1 +
					Math.exp(this.param.w[8]) *
						(11 - t) *
						Math.pow(i, -this.param.w[9]) *
						(Math.exp((1 - s) * this.param.w[10]) - 1) *
						r *
						n),
			R,
			36500,
		).toFixed(8);
	}
	next_forget_stability(t, e, i) {
		return +y(
			this.param.w[11] *
				Math.pow(t, -this.param.w[12]) *
				(Math.pow(e + 1, this.param.w[13]) - 1) *
				Math.exp((1 - i) * this.param.w[14]),
			R,
			36500,
		).toFixed(8);
	}
	next_short_term_stability(t, e) {
		const i =
				Math.pow(t, -this.param.w[19]) *
				Math.exp(this.param.w[17] * (e - 3 + this.param.w[18])),
			s = e >= 3 ? Math.max(i, 1) : i;
		return +y(t * s, R, 36500).toFixed(8);
	}
	forgetting_curve;
	next_state(t, e, i) {
		const { difficulty: s, stability: a } = t ?? {
			difficulty: 0,
			stability: 0,
		};
		if (e < 0) throw new Error(`Invalid delta_t "${e}"`);
		if (i < 0 || i > 4) throw new Error(`Invalid grade "${i}"`);
		if (s === 0 && a === 0)
			return {
				difficulty: y(this.init_difficulty(i), 1, 10),
				stability: this.init_stability(i),
			};
		if (i === 0) return { difficulty: s, stability: a };
		if (s < 1 || a < R)
			throw new Error(
				`Invalid memory state { difficulty: ${s}, stability: ${a} }`,
			);
		const r = this.forgetting_curve(e, a),
			n = this.next_recall_stability(s, a, r, i),
			l = this.next_forget_stability(s, a, r),
			d = this.next_short_term_stability(a, i);
		let o = n;
		if (i === 1) {
			let [t, e] = [0, 0];
			this.param.enable_short_term &&
				((t = this.param.w[17]), (e = this.param.w[18]));
			const i = a / Math.exp(t * e);
			o = y(+i.toFixed(8), R, l);
		}
		return (
			e === 0 && this.param.enable_short_term && (o = d),
			{ difficulty: this.next_difficulty(s, i), stability: o }
		);
	}
}
function Y() {
	const t = this.review_time.getTime(),
		e = this.current.reps,
		i = this.current.difficulty * this.current.stability;
	return `${t}_${e}_${i}`;
}
function W(t) {
	return function () {
		const e = Reflect.get(this.current, t) ?? 0,
			i = this.current.reps;
		return String(e + i || 0);
	};
}
const B = (t) => {
		const e = t.slice(-1),
			i = parseInt(t.slice(0, -1), 10);
		if (isNaN(i) || !Number.isFinite(i) || i < 0)
			throw new Error(`Invalid step value: ${t}`);
		switch (e) {
			case "m":
				return i;
			case "h":
				return i * 60;
			case "d":
				return i * 1440;
			default:
				throw new Error(`Invalid step unit: ${t}, expected m/h/d`);
		}
	},
	X = (i, s, a) => {
		const r =
				s === t.Relearning || s === t.Review
					? i.relearning_steps
					: i.learning_steps,
			n = r.length;
		if (n === 0 || a >= n) return {};
		const l = r[0],
			d = B,
			o = () => d(l),
			h = () => {
				if (n === 1) return Math.round(d(l) * 1.5);
				const t = r[1];
				return Math.round((d(l) + d(t)) / 2);
			},
			u = (t) => (t < 0 || t >= n ? null : r[t]),
			c = (t) => d(t),
			_ = {},
			f = u(Math.max(0, a));
		if (s === t.Review)
			return (_[e.Again] = { scheduled_minutes: d(f), next_step: 0 }), _;
		{
			(_[e.Again] = { scheduled_minutes: o(), next_step: 0 }),
				(_[e.Hard] = { scheduled_minutes: h(), next_step: a });
			const t = u(a + 1);
			if (t) {
				const i = c(t);
				i &&
					(_[e.Good] = {
						scheduled_minutes: Math.round(i),
						next_step: a + 1,
					});
			}
		}
		return _;
	};
var V = ((t) => (
	(t.SCHEDULER = "Scheduler"),
	(t.LEARNING_STEPS = "LearningSteps"),
	(t.SEED = "Seed"),
	t
))(V || {});
class J {
	last;
	current;
	review_time;
	next = new Map();
	algorithm;
	strategies;
	elapsed_days = 0;
	constructor(t, e, s, a) {
		(this.algorithm = s),
			(this.last = i.card(t)),
			(this.current = i.card(t)),
			(this.review_time = i.time(e)),
			(this.strategies = a),
			this.init();
	}
	checkGrade(t) {
		if (!Number.isFinite(t) || t < 0 || t > 4)
			throw new Error(`Invalid grade "${t}",expected 1-4`);
	}
	init() {
		const { state: e, last_review: i } = this.current;
		let s = 0;
		e !== t.New && i && (s = m(i, this.review_time)),
			(this.current.last_review = this.review_time),
			(this.elapsed_days = s),
			(this.current.elapsed_days = s),
			(this.current.reps += 1);
		let a = Y;
		if (this.strategies) {
			const t = this.strategies.get(V.SEED);
			t && (a = t);
		}
		this.algorithm.seed = a.call(this);
	}
	preview() {
		return {
			[e.Again]: this.review(e.Again),
			[e.Hard]: this.review(e.Hard),
			[e.Good]: this.review(e.Good),
			[e.Easy]: this.review(e.Easy),
			[Symbol.iterator]: this.previewIterator.bind(this),
		};
	}
	*previewIterator() {
		for (const t of _) yield this.review(t);
	}
	review(e) {
		const { state: i } = this.last;
		let s;
		switch ((this.checkGrade(e), i)) {
			case t.New:
				s = this.newState(e);
				break;
			case t.Learning:
			case t.Relearning:
				s = this.learningState(e);
				break;
			case t.Review:
				s = this.reviewState(e);
				break;
		}
		return s;
	}
	buildLog(t) {
		const { last_review: e, due: i, elapsed_days: s } = this.last;
		return {
			rating: t,
			state: this.current.state,
			due: e || i,
			stability: this.current.stability,
			difficulty: this.current.difficulty,
			elapsed_days: this.elapsed_days,
			last_elapsed_days: s,
			scheduled_days: this.current.scheduled_days,
			learning_steps: this.current.learning_steps,
			review: this.review_time,
		};
	}
}
class K extends J {
	learningStepsStrategy;
	constructor(t, e, i, s) {
		super(t, e, i, s);
		let a = X;
		if (this.strategies) {
			const t = this.strategies.get(V.LEARNING_STEPS);
			t && (a = t);
		}
		this.learningStepsStrategy = a;
	}
	getLearningInfo(e, i) {
		const s = this.algorithm.parameters;
		e.learning_steps = e.learning_steps || 0;
		const a = this.learningStepsStrategy(
				s,
				e.state,
				this.current.state === t.Learning
					? e.learning_steps + 1
					: e.learning_steps,
			),
			r = Math.max(0, a[i]?.scheduled_minutes ?? 0),
			n = Math.max(0, a[i]?.next_step ?? 0);
		return { scheduled_minutes: r, next_steps: n };
	}
	applyLearningSteps(e, i, a) {
		const { scheduled_minutes: r, next_steps: n } = this.getLearningInfo(
			this.current,
			i,
		);
		if (r > 0 && r < 1440)
			(e.learning_steps = n),
				(e.scheduled_days = 0),
				(e.state = a),
				(e.due = s(this.review_time, Math.round(r), !1));
		else if (((e.state = t.Review), r >= 1440))
			(e.learning_steps = n),
				(e.due = s(this.review_time, Math.round(r), !1)),
				(e.scheduled_days = Math.floor(r / 1440));
		else {
			e.learning_steps = 0;
			const t = this.algorithm.next_interval(
				e.stability,
				this.elapsed_days,
			);
			(e.scheduled_days = t), (e.due = s(this.review_time, t, !0));
		}
	}
	newState(e) {
		const s = this.next.get(e);
		if (s) return s;
		const a = i.card(this.current);
		(a.difficulty = y(this.algorithm.init_difficulty(e), 1, 10)),
			(a.stability = this.algorithm.init_stability(e)),
			this.applyLearningSteps(a, e, t.Learning);
		const r = { card: a, log: this.buildLog(e) };
		return this.next.set(e, r), r;
	}
	learningState(t) {
		const e = this.next.get(t);
		if (e) return e;
		const { state: s, difficulty: a, stability: r } = this.last,
			n = i.card(this.current);
		(n.difficulty = this.algorithm.next_difficulty(a, t)),
			(n.stability = this.algorithm.next_short_term_stability(r, t)),
			this.applyLearningSteps(n, t, s);
		const l = { card: n, log: this.buildLog(t) };
		return this.next.set(t, l), l;
	}
	reviewState(s) {
		const a = this.next.get(s);
		if (a) return a;
		const r = this.elapsed_days,
			{ difficulty: n, stability: l } = this.last,
			d = this.algorithm.forgetting_curve(r, l),
			o = i.card(this.current),
			h = i.card(this.current),
			u = i.card(this.current),
			c = i.card(this.current);
		this.next_ds(o, h, u, c, n, l, d),
			this.next_interval(h, u, c, r),
			this.next_state(h, u, c),
			this.applyLearningSteps(o, e.Again, t.Relearning),
			(o.lapses += 1);
		const _ = { card: o, log: this.buildLog(e.Again) },
			f = { card: h, log: super.buildLog(e.Hard) },
			g = { card: u, log: super.buildLog(e.Good) },
			y = { card: c, log: super.buildLog(e.Easy) };
		return (
			this.next.set(e.Again, _),
			this.next.set(e.Hard, f),
			this.next.set(e.Good, g),
			this.next.set(e.Easy, y),
			this.next.get(s)
		);
	}
	next_ds(t, i, s, a, r, n, l) {
		t.difficulty = this.algorithm.next_difficulty(r, e.Again);
		const d =
				n /
				Math.exp(
					this.algorithm.parameters.w[17] *
						this.algorithm.parameters.w[18],
				),
			o = this.algorithm.next_forget_stability(r, n, l);
		(t.stability = y(+d.toFixed(8), R, o)),
			(i.difficulty = this.algorithm.next_difficulty(r, e.Hard)),
			(i.stability = this.algorithm.next_recall_stability(
				r,
				n,
				l,
				e.Hard,
			)),
			(s.difficulty = this.algorithm.next_difficulty(r, e.Good)),
			(s.stability = this.algorithm.next_recall_stability(
				r,
				n,
				l,
				e.Good,
			)),
			(a.difficulty = this.algorithm.next_difficulty(r, e.Easy)),
			(a.stability = this.algorithm.next_recall_stability(
				r,
				n,
				l,
				e.Easy,
			));
	}
	next_interval(t, e, i, a) {
		let r, n;
		(r = this.algorithm.next_interval(t.stability, a)),
			(n = this.algorithm.next_interval(e.stability, a)),
			(r = Math.min(r, n)),
			(n = Math.max(n, r + 1));
		const l = Math.max(this.algorithm.next_interval(i.stability, a), n + 1);
		(t.scheduled_days = r),
			(t.due = s(this.review_time, r, !0)),
			(e.scheduled_days = n),
			(e.due = s(this.review_time, n, !0)),
			(i.scheduled_days = l),
			(i.due = s(this.review_time, l, !0));
	}
	next_state(e, i, s) {
		(e.state = t.Review),
			(e.learning_steps = 0),
			(i.state = t.Review),
			(i.learning_steps = 0),
			(s.state = t.Review),
			(s.learning_steps = 0);
	}
}
class Q extends J {
	newState(t) {
		const e = this.next.get(t);
		if (e) return e;
		(this.current.scheduled_days = 0), (this.current.elapsed_days = 0);
		const s = i.card(this.current),
			a = i.card(this.current),
			r = i.card(this.current),
			n = i.card(this.current);
		return (
			this.init_ds(s, a, r, n),
			this.next_interval(s, a, r, n, 0),
			this.next_state(s, a, r, n),
			this.update_next(s, a, r, n),
			this.next.get(t)
		);
	}
	init_ds(t, i, s, a) {
		(t.difficulty = y(this.algorithm.init_difficulty(e.Again), 1, 10)),
			(t.stability = this.algorithm.init_stability(e.Again)),
			(i.difficulty = y(this.algorithm.init_difficulty(e.Hard), 1, 10)),
			(i.stability = this.algorithm.init_stability(e.Hard)),
			(s.difficulty = y(this.algorithm.init_difficulty(e.Good), 1, 10)),
			(s.stability = this.algorithm.init_stability(e.Good)),
			(a.difficulty = y(this.algorithm.init_difficulty(e.Easy), 1, 10)),
			(a.stability = this.algorithm.init_stability(e.Easy));
	}
	learningState(t) {
		return this.reviewState(t);
	}
	reviewState(t) {
		const e = this.next.get(t);
		if (e) return e;
		const s = this.elapsed_days,
			{ difficulty: a, stability: r } = this.last,
			n = this.algorithm.forgetting_curve(s, r),
			l = i.card(this.current),
			d = i.card(this.current),
			o = i.card(this.current),
			h = i.card(this.current);
		return (
			this.next_ds(l, d, o, h, a, r, n),
			this.next_interval(l, d, o, h, s),
			this.next_state(l, d, o, h),
			(l.lapses += 1),
			this.update_next(l, d, o, h),
			this.next.get(t)
		);
	}
	next_ds(t, i, s, a, r, n, l) {
		t.difficulty = this.algorithm.next_difficulty(r, e.Again);
		const d = this.algorithm.next_forget_stability(r, n, l);
		(t.stability = y(n, R, d)),
			(i.difficulty = this.algorithm.next_difficulty(r, e.Hard)),
			(i.stability = this.algorithm.next_recall_stability(
				r,
				n,
				l,
				e.Hard,
			)),
			(s.difficulty = this.algorithm.next_difficulty(r, e.Good)),
			(s.stability = this.algorithm.next_recall_stability(
				r,
				n,
				l,
				e.Good,
			)),
			(a.difficulty = this.algorithm.next_difficulty(r, e.Easy)),
			(a.stability = this.algorithm.next_recall_stability(
				r,
				n,
				l,
				e.Easy,
			));
	}
	next_interval(t, e, i, a, r) {
		let n, l, d, o;
		(n = this.algorithm.next_interval(t.stability, r)),
			(l = this.algorithm.next_interval(e.stability, r)),
			(d = this.algorithm.next_interval(i.stability, r)),
			(o = this.algorithm.next_interval(a.stability, r)),
			(n = Math.min(n, l)),
			(l = Math.max(l, n + 1)),
			(d = Math.max(d, l + 1)),
			(o = Math.max(o, d + 1)),
			(t.scheduled_days = n),
			(t.due = s(this.review_time, n, !0)),
			(e.scheduled_days = l),
			(e.due = s(this.review_time, l, !0)),
			(i.scheduled_days = d),
			(i.due = s(this.review_time, d, !0)),
			(a.scheduled_days = o),
			(a.due = s(this.review_time, o, !0));
	}
	next_state(e, i, s, a) {
		(e.state = t.Review),
			(e.learning_steps = 0),
			(i.state = t.Review),
			(i.learning_steps = 0),
			(s.state = t.Review),
			(s.learning_steps = 0),
			(a.state = t.Review),
			(a.learning_steps = 0);
	}
	update_next(t, i, s, a) {
		const r = { card: t, log: this.buildLog(e.Again) },
			n = { card: i, log: super.buildLog(e.Hard) },
			l = { card: s, log: super.buildLog(e.Good) },
			d = { card: a, log: super.buildLog(e.Easy) };
		this.next.set(e.Again, r),
			this.next.set(e.Hard, n),
			this.next.set(e.Good, l),
			this.next.set(e.Easy, d);
	}
}
class Z {
	fsrs;
	constructor(t) {
		this.fsrs = t;
	}
	replay(t, e, i) {
		return this.fsrs.next(t, e, i);
	}
	handleManualRating(i, s, r, n, l, d, o) {
		if (typeof s > "u")
			throw new Error("reschedule: state is required for manual rating");
		let h, u;
		if (s === t.New)
			(h = {
				rating: e.Manual,
				state: s,
				due: o ?? r,
				stability: i.stability,
				difficulty: i.difficulty,
				elapsed_days: n,
				last_elapsed_days: i.elapsed_days,
				scheduled_days: i.scheduled_days,
				learning_steps: i.learning_steps,
				review: r,
			}),
				(u = z(r)),
				(u.last_review = r);
		else {
			if (typeof o > "u")
				throw new Error(
					"reschedule: due is required for manual rating",
				);
			const t = a(o, r, "days");
			(h = {
				rating: e.Manual,
				state: i.state,
				due: i.last_review || i.due,
				stability: i.stability,
				difficulty: i.difficulty,
				elapsed_days: n,
				last_elapsed_days: i.elapsed_days,
				scheduled_days: i.scheduled_days,
				learning_steps: i.learning_steps,
				review: r,
			}),
				(u = {
					...i,
					state: s,
					due: o,
					last_review: r,
					stability: l || i.stability,
					difficulty: d || i.difficulty,
					elapsed_days: n,
					scheduled_days: t,
					reps: i.reps + 1,
				});
		}
		return { card: u, log: h };
	}
	reschedule(s, r) {
		const n = [];
		let l = z(s.due);
		for (const s of r) {
			let r;
			if (((s.review = i.time(s.review)), s.rating === e.Manual)) {
				let e = 0;
				l.state !== t.New &&
					l.last_review &&
					(e = a(s.review, l.last_review, "days")),
					(r = this.handleManualRating(
						l,
						s.state,
						s.review,
						e,
						s.stability,
						s.difficulty,
						s.due ? i.time(s.due) : void 0,
					));
			} else r = this.replay(l, s.review, s.rating);
			n.push(r), (l = r.card);
		}
		return n;
	}
	calculateManualRecord(t, e, s, r) {
		if (!s) return null;
		const { card: n, log: l } = s,
			d = i.card(t);
		return d.due.getTime() === n.due.getTime()
			? null
			: ((d.scheduled_days = a(n.due, d.due, "days")),
				this.handleManualRating(
					d,
					n.state,
					i.time(e),
					l.elapsed_days,
					r ? n.stability : void 0,
					r ? n.difficulty : void 0,
					n.due,
				));
	}
}
class tt extends O {
	strategyHandler = new Map();
	Scheduler;
	constructor(t) {
		super(t);
		const { enable_short_term: e } = this.parameters;
		this.Scheduler = e ? K : Q;
	}
	params_handler_proxy() {
		const t = this;
		return {
			set: function (e, i, s) {
				return (
					i === "request_retention" && Number.isFinite(s)
						? (t.intervalModifier = t.calculate_interval_modifier(
								Number(s),
							))
						: i === "enable_short_term"
							? (t.Scheduler = s === !0 ? K : Q)
							: i === "w" &&
								((s = H(T(s), e.relearning_steps.length)),
								(t.forgetting_curve = j.bind(this, s)),
								(t.intervalModifier =
									t.calculate_interval_modifier(
										Number(e.request_retention),
									))),
					Reflect.set(e, i, s),
					!0
				);
			},
		};
	}
	useStrategy(t, e) {
		return this.strategyHandler.set(t, e), this;
	}
	clearStrategy(t) {
		return (
			t ? this.strategyHandler.delete(t) : this.strategyHandler.clear(),
			this
		);
	}
	getScheduler(t, e) {
		const i = this.strategyHandler.get(V.SCHEDULER) || this.Scheduler;
		return new i(t, e, this, this.strategyHandler);
	}
	repeat(t, e, i) {
		const s = this.getScheduler(t, e).preview();
		return i && typeof i == "function" ? i(s) : s;
	}
	next(t, s, a, r) {
		const n = this.getScheduler(t, s),
			l = i.rating(a);
		if (l === e.Manual) throw new Error("Cannot review a manual rating");
		const d = n.review(l);
		return r && typeof r == "function" ? r(d) : d;
	}
	get_retrievability(e, s, r = !0) {
		const n = i.card(e);
		s = s ? i.time(s) : new Date();
		const l =
				n.state !== t.New
					? Math.max(a(s, n.last_review, "days"), 0)
					: 0,
			d =
				n.state !== t.New
					? this.forgetting_curve(l, +n.stability.toFixed(8))
					: 0;
		return r ? `${(d * 100).toFixed(2)}%` : d;
	}
	rollback(s, a, r) {
		const n = i.card(s),
			l = i.review_log(a);
		if (l.rating === e.Manual)
			throw new Error("Cannot rollback a manual rating");
		let d, o, h;
		switch (l.state) {
			case t.New:
				(d = l.due), (o = void 0), (h = 0);
				break;
			case t.Learning:
			case t.Relearning:
			case t.Review:
				(d = l.review),
					(o = l.due),
					(h =
						n.lapses -
						(l.rating === e.Again && l.state === t.Review ? 1 : 0));
				break;
		}
		const u = {
			...n,
			due: d,
			stability: l.stability,
			difficulty: l.difficulty,
			elapsed_days: l.last_elapsed_days,
			scheduled_days: l.scheduled_days,
			reps: Math.max(0, n.reps - 1),
			lapses: Math.max(0, h),
			learning_steps: l.learning_steps,
			state: l.state,
			last_review: o,
		};
		return r && typeof r == "function" ? r(u) : u;
	}
	forget(s, r, n = !1, l) {
		const d = i.card(s);
		r = i.time(r);
		const o = d.state === t.New ? 0 : a(r, d.due, "days"),
			h = {
				rating: e.Manual,
				state: d.state,
				due: d.due,
				stability: d.stability,
				difficulty: d.difficulty,
				elapsed_days: 0,
				last_elapsed_days: d.elapsed_days,
				scheduled_days: o,
				learning_steps: d.learning_steps,
				review: r,
			},
			u = {
				card: {
					...d,
					due: r,
					stability: 0,
					difficulty: 0,
					elapsed_days: 0,
					scheduled_days: 0,
					reps: n ? 0 : d.reps,
					lapses: n ? 0 : d.lapses,
					learning_steps: 0,
					state: t.New,
					last_review: d.last_review,
				},
				log: h,
			};
		return l && typeof l == "function" ? l(u) : u;
	}
	reschedule(t, s = [], a = {}) {
		const {
			recordLogHandler: r,
			reviewsOrderBy: n,
			skipManual: l = !0,
			now: d = new Date(),
			update_memory_state: o = !1,
		} = a;
		n && typeof n == "function" && s.sort(n),
			l && (s = s.filter((t) => t.rating !== e.Manual));
		const h = new Z(this),
			u = h.reschedule(a.first_card || z(), s),
			c = u.length,
			_ = i.card(t),
			f = h.calculateManualRecord(_, d, c ? u[c - 1] : void 0, o);
		return r && typeof r == "function"
			? { collections: u.map(r), reschedule_item: f ? r(f) : null }
			: { collections: u, reschedule_item: f };
	}
}
const et = (t) => new tt(t || {});
export {
	J as AbstractScheduler,
	X as BasicLearningStepsStrategy,
	I as CLAMP_PARAMETERS,
	B as ConvertStepUnitToMinutes,
	Y as DefaultInitSeedStrategy,
	tt as FSRS,
	L as FSRS5_DEFAULT_DECAY,
	N as FSRS6_DEFAULT_DECAY,
	O as FSRSAlgorithm,
	E as FSRSVersion,
	W as GenSeedStrategyWithCardId,
	_ as Grades,
	A as INIT_S_MAX,
	e as Rating,
	F as S_MAX,
	R as S_MIN,
	t as State,
	V as StrategyMode,
	i as TypeConvert,
	D as W17_W18_Ceiling,
	C as checkParameters,
	y as clamp,
	H as clipParameters,
	P as computeDecayFactor,
	z as createEmptyCard,
	m as dateDiffInDays,
	a as date_diff,
	s as date_scheduler,
	x as default_enable_fuzz,
	b as default_enable_short_term,
	M as default_learning_steps,
	v as default_maximum_interval,
	S as default_relearning_steps,
	w as default_request_retention,
	$ as default_w,
	h as fixDate,
	c as fixRating,
	u as fixState,
	j as forgetting_curve,
	r as formatDate,
	et as fsrs,
	G as generatorParameters,
	g as get_fuzz_range,
	T as migrateParameters,
	o as show_diff_message,
};
export default null;
//# sourceMappingURL=/sm/915b75f1d9f642d56d0bea8b0cd25dc8f64a4dc04b803d981cbd1d78cca0b34c.map
