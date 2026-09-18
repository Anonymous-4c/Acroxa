// ./src/views/editor.js
const {
	el,
	div,
	icon,
	Toggle,
	Input,
	CustomDropdown,
	IconDropdown,
	SplitButtonDropdown
} = require("./lib/framework");

function renderSlashMenu() {
	const SLASH_ITEMS = [{
			slug: "paragraph",
			label: "Paragraph",
			icon: "paragraph"
		},
		{
			slug: "heading",
			label: "Heading",
			icon: "heading"
		},
		{
			slug: "image",
			label: "Image",
			icon: "image"
		},
		{
			slug: "gallery",
			label: "Gallery",
			icon: "images"
		},
		{
			slug: "video",
			label: "Video",
			icon: "video"
		},
		{
			slug: "button",
			label: "Button",
			icon: "rectangle-wide"
		},
		{
			slug: "alert",
			label: "Alert",
			icon: "triangle-exclamation"
		},
		{
			slug: "code-block",
			label: "Code Block",
			icon: "terminal"
		},
		{
			slug: "columns",
			label: "Columns",
			icon: "columns-3"
		},
		{
			slug: "hero",
			label: "Hero",
			icon: "star"
		},
		{
			slug: "cta",
			label: "CTA",
			icon: "bullhorn"
		},
		{
			slug: "faq",
			label: "FAQ",
			icon: "circle-question"
		},
		{
			slug: "pricing",
			label: "Pricing",
			icon: "tag"
		},
		{
			slug: "table",
			label: "Table",
			icon: "table"
		},
		{
			slug: "divider",
			label: "Divider",
			icon: "minus"
		},
		{
			slug: "tabs",
			label: "Tabs",
			icon: "folder"
		},
		{
			slug: "accordion",
			label: "Accordion",
			icon: "list"
		},
		{
			slug: "timeline",
			label: "Timeline",
			icon: "timeline"
		},
		{
			slug: "features",
			label: "Features",
			icon: "shapes"
		},
		{
			slug: "section",
			label: "Section",
			icon: "square"
		},
		{
			slug: "embed",
			label: "Embed",
			icon: "arrow-up-right-from-square"
		},
	];

	return div({
			id: "editor-slash-menu",
			class: "editor-slash-menu hidden"
		},
		el("input", {
			id: "slash-menu-search",
			class: "slash-menu-search",
			type: "text",
			placeholder: "Type to filter...",
		}),
		div({
				id: "slash-menu-list",
				class: "slash-menu-list"
			},
			...SLASH_ITEMS.map((item) =>
				div({
						class: "slash-menu-item",
						"data-widget-slug": item.slug,
					},
					div({
						class: "slash-menu-item-icon"
					}, icon(item.icon)),
					el("span", {
						class: "slash-menu-item-label"
					}, item.label)
				)
			)
		)
	);
}

function renderToolbar() {
	return div({
			id: "editor-toolbar",
			class: "acrx-editor-toolbar d-flex flex-row al-center jc-between"
		},

		// FORMAT
		div({
				class: "toolbar-group toolbar-format d-flex flex-row al-center"
			},

			el("button", {
				id: "toolbar-bold",
				class: "toolbar-btn",
				dataTitle: "Bold"
			}, icon("bold", "solid")),
			el("button", {
				id: "toolbar-italic",
				class: "toolbar-btn",
				dataTitle: "Italic"
			}, icon("italic", "solid")),
			el("button", {
				id: "toolbar-underline",
				class: "toolbar-btn",
				dataTitle: "Underline"
			}, icon("underline", "solid")),
			el("button", {
				id: "toolbar-strike",
				class: "toolbar-btn",
				dataTitle: "Strike"
			}, icon("strikethrough", "solid")),
			el("button", {
				id: "toolbar-inline-code",
				class: "toolbar-btn",
				dataTitle: "Inline Code"
			}, icon("code", "solid")),
			el("button", {
				id: "toolbar-link",
				class: "toolbar-btn",
				dataTitle: "Link"
			}, icon("link", "solid")),
			el("button", {
				id: "toolbar-blockquote",
				class: "toolbar-btn",
				dataTitle: "Quote"
			}, icon("quote-left", "solid"))
		),

		el("div", {
			class: "toolbar-separator"
		}),

		// ALIGNMENT
		div({
				class: "toolbar-group toolbar-align d-flex flex-row al-center"
			},

			el("button", {
				id: "toolbar-align-left",
				class: "toolbar-btn",
				dataTitle: "Align Left"
			}, icon("align-left", "solid")),
			el("button", {
				id: "toolbar-align-center",
				class: "toolbar-btn",
				dataTitle: "Align Center"
			}, icon("align-center", "solid")),
			el("button", {
				id: "toolbar-align-right",
				class: "toolbar-btn",
				dataTitle: "Align Right"
			}, icon("align-right", "solid")),
			el("button", {
				id: "toolbar-align-justify",
				class: "toolbar-btn",
				dataTitle: "Justify Content"
			}, icon("align-justify", "solid"))
		),

		el("div", {
			class: "toolbar-separator"
		}),

		// ADVANCED
		div({
				class: "toolbar-group toolbar-advanced d-flex flex-row al-center"
			},

			el("button", {
				id: "toolbar-codeblock",
				class: "toolbar-btn",
				dataTitle: "Code Block"
			}, icon("code-square", "solid")),
			el("button", {
				id: "toolbar-table",
				class: "toolbar-btn",
				dataTitle: "Table"
			}, icon("table", "solid")),
			el("button", {
				id: "toolbar-ul",
				class: "toolbar-btn",
				dataTitle: "Bullet List"
			}, icon("list-ul", "solid")),
			el("button", {
				id: "toolbar-ol",
				class: "toolbar-btn",
				dataTitle: "Number List"
			}, icon("list-ol", "solid"))
		)
	);
}

function renderBlockActions() {
	return div({
			class: "editor-block-actions d-flex flex-row al-center"
		},
		el("button", {
			id: "transform-block-btn",
			class: "block-action-btn",
			dataTitle: "Transform Block"
		}, icon("paragraph")),
		div({
				class: "transform-block-dropdown hidden"
			},
			el("button", {
				class: "transform-block-item",
				dataTransform: "paragraph",
				dataTitle: "Paragraph"
			}, icon("paragraph"), "Paragraph"),
			el("button", {
				class: "transform-block-item",
				dataTransform: "heading",
				dataTitle: "Heading"
			}, icon("heading"), "Heading"),
			el("button", {
				class: "transform-block-item",
				dataTransform: "inline-code",
				dataTitle: "Inline Code"
			}, icon("code"), "Inline Code"),
			el("button", {
				class: "transform-block-item",
				dataTransform: "blockquote",
				dataTitle: "Quote"
			}, icon("quote-left"), "Quote"),
			el("button", {
				class: "transform-block-item",
				dataTransform: "code-block",
				dataTitle: "Code Block"
			}, icon("file-code"), "Code Block"),
			el("button", {
				class: "transform-block-item",
				dataTransform: "ordered-list",
				dataTitle: "Ordered List"
			}, icon("list-ol"), "Ordered List"),
			el("button", {
				class: "transform-block-item",
				dataTransform: "unordered-list",
				dataTitle: "Unordered List"
			}, icon("list-ul"), "Unordered List")
		),
		el("div", {
			class: "block-actions-separator"
		}),

		el("button", {
			id: "block-settings-btn",
			class: "block-action-btn",
			dataTitle: "Block Settings"
		}, icon("cog")),
		el("button", {
			id: "Hide-block-btn",
			class: "block-action-btn",
			dataTitle: "Hide Block"
		}, icon("eye-slash")),
		el("button", {
			id: "lock-block-btn",
			class: "block-action-btn",
			dataTitle: "Lock Block"
		}, icon("lock-keyhole-open"), ),

		el("div", {
			class: "block-actions-separator"
		}),

		el("button", {
			id: "duplicate-block-btn",
			class: "block-action-btn",
			dataTitle: "Duplicate Block"
		}, icon("clone")),
		el("button", {
			id: "delete-block-btn",
			class: "block-action-btn",
			dataTitle: "Delete Block"
		}, icon("trash")),
		el("button", {
			id: "move-block-up-btn",
			class: "block-action-btn",
			dataTitle: "Move Block Up"
		}, icon("arrow-up-from-arc")),
		el("button", {
			id: "move-block-down-btn",
			class: "block-action-btn",
			dataTitle: "Move Block Down"
		}, icon("arrow-down-from-arc")),
		el("button", {
			id: "more-block-actions-btn",
			class: "block-action-btn",
			dataTitle: "More Actions"
		}, icon("ellipsis"))
	);
}

function renderEditor() {

	return div({
			class: "acrx-editor d-flex flex-col"
		},

		// ==================================================
		// HEADER
		// ==================================================

		div({
				class: "acrx-editor-header header d-flex flex-row al-center"
			},

			// LEFT
			div({
					class: "acrx-editor-header-left d-flex flex-row al-center"
				},

				el(
					"button", {
						id: "editor-back-btn",
						class: "header-btn",
						dataTitle: "Back"
					},
					icon("angle-left")
				),

				el(
					"button", {
						id: "editor-left-sidebar-toggle",
						class: "header-btn",
						dataTitle: "Toggle Left Sidebar"
					},
					icon("sidebar")
				),
				el("div", {
					class: "header-separator"
				}),
			Toggle({
				id: "editor-autosave-toggle",
				label: "Auto Save",
				checked: true
			}),
			el("span", {
				class: "header-sep"
			}),
			el(
				"button", {
					id: "editor-undo-btn",
					class: "header-btn",
					dataTitle: "Undo (Ctrl+Z)",
					ariaLabel: "Undo (Ctrl+Z)"
				},
				icon("rotate-left")
			),
			el(
				"button", {
					id: "editor-redo-btn",
					class: "header-btn",
					dataTitle: "Redo (Ctrl+Shift+Z)",
					ariaLabel: "Redo (Ctrl+Shift+Z)"
				},
				icon("rotate-right")
			)
		),

			// CENTER
			div({
					class: "acrx-editor-header-center d-flex flex-row al-center"
				},

				div({
						id: "editor-cmdk",
						class: "editor-cmdk d-flex flex-row al-center"
					},

					icon("magnifying-glass"),

					el("input", {
						id: "editor-cmdk-input",
						type: "text",
						placeholder: "Search commands..."
					}),

					el(
						"kbd", {
							id: "editor-cmdk-kbd"
						},
						"⌘K"
					)
				)
			),
			div({
					class: "acrx-editor-header-right d-flex flex-row al-center"
				},

				SplitButtonDropdown({
					id: 'editor-save-dropdown',
					label: 'Save',
					items: [{
							label: 'Save as Draft',
							value: 'draft',
							icon: 'floppy-disk'
						},
						{
							label: 'Publish',
							value: 'publish',
							icon: 'rocket-launch'
						},
						{
							label: 'Schedule',
							value: 'schedule',
							icon: 'calendar'
						}
					]
				}),
				el("div", {
					class: "header-separator"
				}),
				// Right Sidebar Toggle
				el(
					"button", {
						id: "editor-right-sidebar-toggle",
						class: "header-btn",
						dataTitle: "Toggle Right Sidebar"
					},
					icon("sidebar-flip")
				),

				// More Actions
				el(
					"button", {
						id: "editor-more-actions",
						class: "header-btn",
						dataTitle: "More Actions"
					},
					icon("ellipsis")
				)
			)
		),

		// ==================================================
		// BODY
		// ==================================================

		div({
				class: "acrx-editor-body d-flex flex-row"
			},

			el("div", {
				id: "editor-command-palette",
				class: "editor-command-palette hidden"
			}),

			// ==================================================
			// LEFT SIDEBAR
			// ==================================================

			div({
					id: "editor-left-sidebar",
					class: "acrx-editor-sidebar d-flex flex-col"
				},

			div({
					class: "sidebar-tabs d-flex flex-row",
					role: "tablist",
					ariaLabel: "Left sidebar panels"
				},

				el("button", {
					id: "sidebar-left-btn-layers",
					class: "sidebar-tab active",
					role: "tab",
					ariaSelected: "true",
					ariaControls: "sidebar-left-panel-layers"
				}, icon("layer-group"), "Layers"),

				el("button", {
					id: "sidebar-left-btn-widgets",
					class: "sidebar-tab",
					role: "tab",
					ariaSelected: "false",
					ariaControls: "sidebar-left-panel-widgets"
				}, icon("cubes"), "Widgets"),

				el("button", {
					id: "sidebar-left-btn-patterns",
					class: "sidebar-tab",
					role: "tab",
					ariaSelected: "false",
					ariaControls: "sidebar-left-panel-patterns"
				}, icon("diamonds-4"), "Patterns")
			),

				div({
						class: "sidebar-content"
					},

				div({
						id: "sidebar-left-panel-layers",
						class: "sidebar-panel active",
						role: "tabpanel",
						ariaLabelledby: "sidebar-left-btn-layers"
					},
						div({
								id: "layers-tree",
								class: "layers-tree"
							},
							div({
									id: "layers-tree-root",
									class: "layers-tree-root tree-root opened",
									dataBlockId: "t-root"
								},
								div({
										id: "layers-tree-root-label",
										class: "layers-tree-root-label"
									},
									el("button", {
										class: "layers-tree-root-toggle",
										id: "layers-tree-root-toggle-btn",
									},
										icon("angle-down"),
									),
									el("button", {
										class: "layers-tree-root-btn",
										id: "layers-tree-root-btn",
									}, icon("layer-group"), "Root"),
								),
								div({
										id: "layers-tree-root-children",
										class: "layers-tree-root-children tree-children opened"
									},
									div({
											id: "layers-tree-root-child-t_1",
											class: "layers-tree-item layers-tree-item-block",
											dataBlockId: "t-1"
										},
										div({
											class: "layers-tree-root-t-1-item-label",
											id: "layers-tree-root-child-t_1-label"
										},
										el("button", {
											class: "layers-tree-root-child-toggle",
											id: "layers-tree-root-child-t_1-toggle-btn",
										}, icon("angle-down")),
										el("button", {
											class: "layers-tree-root-child-btn",
											id: "layers-tree-root-child-t_1-btn",
										}, icon("layer-group"), "Child 1"),
									),
										div({
												id: "layers-tree-root-child-t_1-label",
												class: "layers-tree-root-child-label"
											},
											el("button",{
												class: "layers-tree-root-child-toggle",
												id: "layers-tree-root-child-t_1-toggle-btn",
											}, icon("angle-down")),
											el("button", {
												class: "layers-tree-root-child-btn",
												id: "layers-tree-root-child-t_1-btn",
											}, icon("layer-group"), "Child 1"),
										)
									)
								)
							)
						)
					),

				div({
					id: "sidebar-left-panel-widgets",
					class: "sidebar-panel",
					role: "tabpanel",
					ariaLabelledby: "sidebar-left-btn-widgets"
				}),

				div({
					id: "sidebar-left-panel-patterns",
					class: "sidebar-panel",
					role: "tabpanel",
					ariaLabelledby: "sidebar-left-btn-patterns"
				})
				)
			),

			// ==================================================
			// MAIN
			// ==================================================

			div({
					class: "acrx-editor-main d-flex flex-col"
				},

				// TOOLBAR
				renderToolbar(),
				renderBlockActions(),
				renderSlashMenu(),
				div({
						id: "editor-canvas",
						class: "acrx-editor-canvas d-flex flex-col"
					},
				div({
					id: "canvas-main-input",
					class: "canvas-input is-empty",
					contenteditable: "true",
					dataPlaceholder: "Start typing or use / to add a block"
				}),
				)
			),

			// ==================================================
			// RIGHT SIDEBAR
			// ==================================================

			div({
					id: "editor-right-sidebar",
					class: "acrx-editor-rg-sidebar d-flex flex-col"
				},

			div({
					class: "sidebar-tabs d-flex flex-row",
					role: "tablist",
					ariaLabel: "Right sidebar panels"
				},
				el("button", {
					id: "sidebar-right-btn-post",
					class: "sidebar-tab active",
					role: "tab",
					ariaSelected: "true",
					ariaControls: "sidebar-right-panel-post"
				}, icon("file-lines"), "Post"),
				el("button", {
					id: "sidebar-right-btn-seo",
					class: "sidebar-tab",
					role: "tab",
					ariaSelected: "false",
					ariaControls: "sidebar-right-panel-seo"
				}, icon("chart-line"), "SEO"),

				el("button", {
					id: "sidebar-right-btn-settings",
					class: "sidebar-tab",
					role: "tab",
					ariaSelected: "false",
					ariaControls: "sidebar-right-panel-settings"
				}, icon("cubes"), "Block")
			),

			div({
					class: "sidebar-content"
				},

			div({
					id: "sidebar-right-panel-post",
					class: "sidebar-panel active",
					role: "tabpanel",
					ariaLabelledby: "sidebar-right-btn-post"
				}),
			div({
					id: "sidebar-right-panel-seo",
					class: "sidebar-panel",
					role: "tabpanel",
					ariaLabelledby: "sidebar-right-btn-seo"
				}),
			div({
					id: "sidebar-right-panel-settings",
					class: "sidebar-panel",
					role: "tabpanel",
					ariaLabelledby: "sidebar-right-btn-settings"
				})
			)
		
			)
		),

		// ==================================================
		// FOOTER
		// ==================================================

		div({
				id: "editor-footer",
				class: "acrx-editor-footer d-flex flex-row al-center"
			},
			div({
				id: "editor-breadcrumbs",
				class: "footer-left"
			},
			div({
				class: "breadcrumbs"
			},
			el("span", {
				class: "breadcrumb-item"
			}, "Root"),
			el("button", {
				class: "breadcrumb-sep",
				dataItem: "t-root"
			}, icon("angle-right")),
			el("span", {
				class: "breadcrumb-item"
			}, "Text Block"),
			el("button", {
				class: "breadcrumb-sep",
				dataItem: "t-1"
			}, icon("angle-right")),
			el("span", {
				class: "breadcrumb-item"
			}, "Paragraph"),
			el("button", {
				class: "breadcrumb-sep",
				dataItem: "t-2"
			}, icon("angle-right")),
			el("span", {
				class: "breadcrumb-item"
			}, "List"),
			)),
		div({
				id: "editor-footer-center",
				class: "footer-center"
			},
			el("span", {
				class: "footer-copyright"
			},
			el("span", {
				class: "footer-copyright-item"
			}, "Copyright © 2026"),
			el("a", {
				class: "footer-copyright-item-link",
				href: "https://www.acroxa.com/",
				target: "_blank"
			}, "Acroxa"),
			)
		),
div({
				id: "editor-footer-right",
				class: "footer-right"
			},
				div({
						class: "footer-status"
					},
					el("span", {
							class: "footer-status-item"
						},
						icon("circle-check", "solid"),
						"Saved"
					),
					el("span", {
							class: "footer-line-num"
						},
						icon("hashtag"),
						"Line 42"
					),
					el("span", {
							class: "footer-col-num"
						},
						icon("hashtag"),
						"Col 7"
					)
				)
			)
		)
	);
}

module.exports = {
	renderEditor
};
module.exports.meta = [{
	"path": `/acrx/editor/`,
	"title": "Editor - Acroxa",

	"render": "renderEditor",

	"css": [
		"/acrx/assets/css/ad-st.css",
		"/acrx/assets/css/ad-ed.css",
		"/acrx/assets/css/ad-ed-app.css",
		"/acrx/assets/css/ad-components.css",
	],

	"js": [
		{
			"src": "/acrx/assets/js/hljs.js",
			"type": "text/javascript"
		},
		{
			"src": "/acrx/assets/js/editor.js",
			"type": "module"
		}
	],
	"layout": "empty"
}]
