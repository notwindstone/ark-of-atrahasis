// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
	SPECIALIZED_ELEMENT_KINDS,
	type SafeContainerElement,
	type SafeDocument,
	type SafeElement,
	type SafeVoidElement,
	type SpecializedElementKind,
} from "../src/index.ts";
import { createContainedRoot as makeRoot } from "./support/contained-root.ts";
import { createTestSafeDocument as createSafeDocument } from "./support/create-safe-document.ts";

const CHILD_TEXT_METHODS = [
	"appendChild",
	"insertBefore",
	"removeChild",
	"replaceChild",
	"setText",
	"getText",
] as const;

type ElementFactory<ElementType extends SafeElement> = (
	safeDocument: SafeDocument,
) => ElementType;

const VOID_FACTORIES: readonly [
	name: string,
	tag: string,
	create: ElementFactory<SafeVoidElement>,
	specializedMethods: readonly string[],
][] = [
	["col", "col", (safeDocument) => safeDocument.createCol(), []],
	[
		"input",
		"input",
		(safeDocument) => safeDocument.createInput(),
		["setType", "setValue"],
	],
	[
		"image",
		"img",
		(safeDocument) => safeDocument.createImage(),
		["setSrc", "setAlt"],
	],
	[
		"source",
		"source",
		(safeDocument) => safeDocument.createSource(),
		["setSrc", "setType"],
	],
	[
		"track",
		"track",
		(safeDocument) => safeDocument.createTrack(),
		["setKind", "setSrc", "setSrcLang", "setLabel", "setDefault"],
	],
	["hr", "hr", (safeDocument) => safeDocument.createHr(), []],
	["br", "br", (safeDocument) => safeDocument.createBr(), []],
	["wbr", "wbr", (safeDocument) => safeDocument.createWbr(), []],
];

const CONTAINER_FACTORIES: readonly [
	name: string,
	tag: string,
	create: ElementFactory<SafeContainerElement>,
][] = [
	["div", "div", (safeDocument) => safeDocument.createDiv()],
	["span", "span", (safeDocument) => safeDocument.createSpan()],
	["section", "section", (safeDocument) => safeDocument.createSection()],
	["article", "article", (safeDocument) => safeDocument.createArticle()],
	["nav", "nav", (safeDocument) => safeDocument.createNav()],
	["header", "header", (safeDocument) => safeDocument.createHeader()],
	["footer", "footer", (safeDocument) => safeDocument.createFooter()],
	["main", "main", (safeDocument) => safeDocument.createMain()],
	["aside", "aside", (safeDocument) => safeDocument.createAside()],
	["figure", "figure", (safeDocument) => safeDocument.createFigure()],
	[
		"figcaption",
		"figcaption",
		(safeDocument) => safeDocument.createFigcaption(),
	],
	["paragraph", "p", (safeDocument) => safeDocument.createParagraph()],
	["heading", "h2", (safeDocument) => safeDocument.createHeading(2)],
	[
		"formatting",
		"strong",
		(safeDocument) => safeDocument.createFormatting("strong"),
	],
	[
		"blockquote",
		"blockquote",
		(safeDocument) => safeDocument.createBlockquote(),
	],
	["pre", "pre", (safeDocument) => safeDocument.createPre()],
	[
		"unordered list",
		"ul",
		(safeDocument) => safeDocument.createList("unordered"),
	],
	["ordered list", "ol", (safeDocument) => safeDocument.createList("ordered")],
	[
		"description list",
		"dl",
		(safeDocument) => safeDocument.createList("description"),
	],
	["list item", "li", (safeDocument) => safeDocument.createListItem()],
	["term", "dt", (safeDocument) => safeDocument.createTerm()],
	["description", "dd", (safeDocument) => safeDocument.createDescription()],
	["table", "table", (safeDocument) => safeDocument.createTable()],
	["thead", "thead", (safeDocument) => safeDocument.createThead()],
	["tbody", "tbody", (safeDocument) => safeDocument.createTbody()],
	["tfoot", "tfoot", (safeDocument) => safeDocument.createTfoot()],
	["tr", "tr", (safeDocument) => safeDocument.createTr()],
	["th", "th", (safeDocument) => safeDocument.createTh()],
	["td", "td", (safeDocument) => safeDocument.createTd()],
	["caption", "caption", (safeDocument) => safeDocument.createCaption()],
	["colgroup", "colgroup", (safeDocument) => safeDocument.createColgroup()],
	["button", "button", (safeDocument) => safeDocument.createButton()],
	["select", "select", (safeDocument) => safeDocument.createSelect()],
	["option", "option", (safeDocument) => safeDocument.createOption()],
	["optgroup", "optgroup", (safeDocument) => safeDocument.createOptgroup()],
	["textarea", "textarea", (safeDocument) => safeDocument.createTextarea()],
	["label", "label", (safeDocument) => safeDocument.createLabel()],
	["fieldset", "fieldset", (safeDocument) => safeDocument.createFieldset()],
	["legend", "legend", (safeDocument) => safeDocument.createLegend()],
	["video", "video", (safeDocument) => safeDocument.createVideo()],
	["audio", "audio", (safeDocument) => safeDocument.createAudio()],
	["picture", "picture", (safeDocument) => safeDocument.createPicture()],
	["canvas", "canvas", (safeDocument) => safeDocument.createCanvas()],
	["anchor", "a", (safeDocument) => safeDocument.createAnchor()],
	["details", "details", (safeDocument) => safeDocument.createDetails()],
	["summary", "summary", (safeDocument) => safeDocument.createSummary()],
	["dialog", "dialog", (safeDocument) => safeDocument.createDialog()],
	["progress", "progress", (safeDocument) => safeDocument.createProgress()],
	["meter", "meter", (safeDocument) => safeDocument.createMeter()],
	["output", "output", (safeDocument) => safeDocument.createOutput()],
	["time", "time", (safeDocument) => safeDocument.createTime()],
	["data", "data", (safeDocument) => safeDocument.createData()],
	["ruby", "ruby", (safeDocument) => safeDocument.createRuby()],
	["rt", "rt", (safeDocument) => safeDocument.createRt()],
	["rp", "rp", (safeDocument) => safeDocument.createRp()],
	["bdi", "bdi", (safeDocument) => safeDocument.createBdi()],
];

const SPECIALIZED_FACTORIES: Readonly<
	Record<SpecializedElementKind, ElementFactory<SafeElement>>
> = {
	input: (safeDocument) => safeDocument.createInput(),
	textarea: (safeDocument) => safeDocument.createTextarea(),
	select: (safeDocument) => safeDocument.createSelect(),
	option: (safeDocument) => safeDocument.createOption(),
	optgroup: (safeDocument) => safeDocument.createOptgroup(),
	button: (safeDocument) => safeDocument.createButton(),
	label: (safeDocument) => safeDocument.createLabel(),
	fieldset: (safeDocument) => safeDocument.createFieldset(),
	image: (safeDocument) => safeDocument.createImage(),
	anchor: (safeDocument) => safeDocument.createAnchor(),
	video: (safeDocument) => safeDocument.createVideo(),
	audio: (safeDocument) => safeDocument.createAudio(),
	source: (safeDocument) => safeDocument.createSource(),
	track: (safeDocument) => safeDocument.createTrack(),
	canvas: (safeDocument) => safeDocument.createCanvas(),
	th: (safeDocument) => safeDocument.createTh(),
	td: (safeDocument) => safeDocument.createTd(),
	details: (safeDocument) => safeDocument.createDetails(),
	dialog: (safeDocument) => safeDocument.createDialog(),
	progress: (safeDocument) => safeDocument.createProgress(),
	meter: (safeDocument) => safeDocument.createMeter(),
	list: (safeDocument) => safeDocument.createList("unordered"),
	"description-list": (safeDocument) => safeDocument.createList("description"),
};

describe("public element runtime families", () => {
	beforeEach(() => {
		document.body.replaceChildren();
	});

	it.each(
		VOID_FACTORIES,
	)("%s omits child/text capabilities and keeps common/specialized capabilities", (_name, _tag, create, specializedMethods) => {
		const wrapper = create(createSafeDocument(makeRoot()));

		for (const method of CHILD_TEXT_METHODS) {
			expect(method in wrapper).toBe(false);
			expect(typeof Reflect.get(wrapper, method)).toBe("undefined");
		}
		expect(typeof wrapper.setClass).toBe("function");
		expect(typeof wrapper.onClick).toBe("function");
		expect(typeof wrapper.style.set).toBe("function");
		for (const method of specializedMethods) {
			expect(typeof Reflect.get(wrapper, method)).toBe("function");
		}
	});

	it.each(
		CONTAINER_FACTORIES,
	)("%s exposes working child/text capabilities", (name, _tag, create) => {
		const root = makeRoot();
		const safeDocument = createSafeDocument(root);
		const wrapper = create(safeDocument);
		const child = safeDocument.createTextNode();
		child.setText(`child:${name}`);

		for (const method of CHILD_TEXT_METHODS) {
			expect(typeof wrapper[method]).toBe("function");
		}
		wrapper.appendChild(child);
		safeDocument.appendChild(wrapper);
		expect(root.textContent).toBe(`child:${name}`);
		wrapper.setText(`text:${name}`);
		expect(wrapper.getText()).toBe(`text:${name}`);
	});

	it.each([
		...VOID_FACTORIES,
		...CONTAINER_FACTORIES,
	])("%s creates the exact raw <%s> tag", (_name, expectedTag, create) => {
		const root = makeRoot();
		const safeDocument = createSafeDocument(root);
		safeDocument.appendChild(create(safeDocument));

		expect(root.firstElementChild?.localName).toBe(expectedTag);
	});

	it("looks up every specialized kind by immutable registry metadata", () => {
		const safeDocument = createSafeDocument(makeRoot());

		SPECIALIZED_ELEMENT_KINDS.forEach((kind, index) => {
			const wrapper = SPECIALIZED_FACTORIES[kind](safeDocument);
			const localId = `specialized-${kind}`;
			const wrongKind =
				SPECIALIZED_ELEMENT_KINDS[
					(index + 1) % SPECIALIZED_ELEMENT_KINDS.length
				];
			if (wrongKind === undefined)
				throw new Error("missing wrong-kind fixture");
			wrapper.setId(localId);
			safeDocument.appendChild(wrapper);

			expect(safeDocument.getElement(localId)).toBe(wrapper);
			expect(safeDocument.getElement(localId, kind)).toBe(wrapper);
			expect(safeDocument.getElement(localId, wrongKind)).toBeNull();
		});
	});

	it("validates lookup kinds and keeps wrapper identity through detach/reappend", () => {
		const safeDocument = createSafeDocument(makeRoot());
		const input = safeDocument.createInput();
		input.setId("stable-input");
		safeDocument.appendChild(input);

		expect(() =>
			Reflect.apply(safeDocument.getElement, undefined, ["stable-input", {}]),
		).toThrowError(
			expect.objectContaining({
				code: "ERR_INVALID_ARGUMENT",
				operation: "SafeDocument.getElement.kind",
			}),
		);
		expect(() =>
			Reflect.apply(safeDocument.getElement, undefined, [
				"stable-input",
				Symbol("input"),
			]),
		).toThrowError(
			expect.objectContaining({ operation: "SafeDocument.getElement.kind" }),
		);

		input.detach();
		expect(safeDocument.getElement("stable-input", "input")).toBeNull();
		safeDocument.appendChild(input);
		expect(safeDocument.getElement("stable-input", "input")).toBe(input);
		input.dispose();
		expect(safeDocument.getElement("stable-input", "input")).toBeNull();
	});

	it("keeps list-local factories detached until the caller appends explicitly", () => {
		const root = makeRoot();
		const safeDocument = createSafeDocument(root);
		const list = safeDocument.createList("unordered");
		const descriptionList = safeDocument.createList("description");
		const item = list.createItem();
		const term = descriptionList.createTerm();
		const description = descriptionList.createDescription();

		safeDocument.appendChild(list);
		safeDocument.appendChild(descriptionList);
		expect(root.querySelectorAll("li, dt, dd")).toHaveLength(0);

		list.appendChild(item);
		descriptionList.appendChild(term);
		descriptionList.appendChild(description);
		expect(root.querySelectorAll("li, dt, dd")).toHaveLength(3);
	});

	it("keeps descendants reusable after parent setText detaches them", () => {
		const root = makeRoot();
		const safeDocument = createSafeDocument(root);
		const parent = safeDocument.createDiv();
		const child = safeDocument.createSpan();
		child.setText("reappend me");
		parent.appendChild(child);
		safeDocument.appendChild(parent);

		parent.setText("replacement");
		expect(parent.getText()).toBe("replacement");
		expect(() => child.getText()).not.toThrow();

		parent.appendChild(child);
		expect(parent.getText()).toBe("replacementreappend me");
	});

	it("hardens document, common, container, void, style, and function capabilities", () => {
		const safeDocument = createSafeDocument(makeRoot());
		const containerElement = safeDocument.createDiv();
		const voidElement = safeDocument.createBr();

		for (const value of [
			safeDocument,
			safeDocument.createDiv,
			containerElement,
			containerElement.appendChild,
			containerElement.style,
			containerElement.style.set,
			voidElement,
			voidElement.setClass,
		]) {
			expect(Object.isFrozen(value)).toBe(true);
		}
	});
});
