const { getAISettings, callAI, parseJSON } = require('./aiController');

async function getAISettingsSafe() {
	try { return await getAISettings(); } catch { return null; }
}

const TRANSFORM_OPERATIONS = {
	rewrite: 'Rewrite the following text to be clearer and more engaging while preserving the original meaning.',
	improve: 'Improve the writing quality of the following text. Fix grammar, enhance clarity, and make it more professional.',
	shorten: 'Shorten the following text while keeping the key points and meaning.',
	expand: 'Expand the following text with more detail and elaboration while maintaining the original tone.',
	summarize: 'Summarize the following text concisely.',
	fixGrammar: 'Fix all grammar, spelling, and punctuation errors in the following text. Return only the corrected text.',
	changeTone: (tone) => `Rewrite the following text in a ${tone} tone while preserving the meaning.`,
};

function getTransformPrompt(operation, tone) {
	const prompt = TRANSFORM_OPERATIONS[operation];
	if (typeof prompt === 'function') return prompt(tone);
	return prompt || TRANSFORM_OPERATIONS.rewrite;
}

exports.getStatus = async (req, res) => {
	try {
		const ai = await getAISettingsSafe();
		res.json({
			success: true,
			enabled: !!(ai?.enabled),
			provider: ai?.defaultProvider || null,
			available: !!(ai?.enabled && ai?.providers?.[ai?.defaultProvider]?.apiKey),
		});
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
};

exports.transformText = async (req, res) => {
	try {
		const ai = await getAISettingsSafe();
		if (!ai?.enabled) return res.status(403).json({ success: false, error: 'AI is disabled' });

		const { text, operation = 'rewrite', tone } = req.body;
		if (!text) return res.status(400).json({ success: false, error: 'Text is required' });

		const systemPrompt = `${getTransformPrompt(operation, tone)} Return ONLY the transformed text with no explanation, no markdown, no quotes.`;
		const raw = await callAI(systemPrompt, text, ai);
		res.json({ success: true, text: raw.trim() });
	} catch (err) {
		console.error('[AIContent] transform error:', err);
		res.status(500).json({ success: false, error: err.message });
	}
};

exports.generateContent = async (req, res) => {
	try {
		const ai = await getAISettingsSafe();
		if (!ai?.enabled) return res.status(403).json({ success: false, error: 'AI is disabled' });

		const { prompt, context = '' } = req.body;
		if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required' });

		const systemPrompt = `You are a professional content writer. Generate high-quality content based on the given prompt. Return ONLY the generated content with no explanation, no markdown, no quotes.`;
		const userPrompt = `${context ? `Context: ${context}\n\n` : ''}Prompt: ${prompt}`;
		const raw = await callAI(systemPrompt, userPrompt, ai);
		res.json({ success: true, text: raw.trim() });
	} catch (err) {
		console.error('[AIContent] generate error:', err);
		res.status(500).json({ success: false, error: err.message });
	}
};

exports.generateHeading = async (req, res) => {
	try {
		const ai = await getAISettingsSafe();
		if (!ai?.enabled) return res.status(403).json({ success: false, error: 'AI is disabled' });

		const { content = '', title = '' } = req.body;
		const systemPrompt = `You are an expert copywriter. Generate 3 compelling headings for the given content. Return ONLY a JSON array of strings with no explanation, no markdown. Example: ["Heading 1", "Heading 2", "Heading 3"]`;
		const userPrompt = `Content: ${content.substring(0, 500)}${title ? `\n\nPage Title: ${title}` : ''}`;
		const raw = await callAI(systemPrompt, userPrompt, ai);
		try {
			const headings = parseJSON(raw);
			res.json({ success: true, headings: Array.isArray(headings) ? headings : [headings] });
		} catch {
			const lines = raw.split('\n').map(l => l.replace(/^[\d\-\*\.\)\]]+\s*/, '').trim()).filter(Boolean);
			res.json({ success: true, headings: lines.slice(0, 3) });
		}
	} catch (err) {
		console.error('[AIContent] heading error:', err);
		res.status(500).json({ success: false, error: err.message });
	}
};

exports.generateExcerpt = async (req, res) => {
	try {
		const ai = await getAISettingsSafe();
		if (!ai?.enabled) return res.status(403).json({ success: false, error: 'AI is disabled' });

		const { content = '' } = req.body;
		if (!content) return res.status(400).json({ success: false, error: 'Content is required' });

		const systemPrompt = `You are an expert editor. Write a compelling 2-3 sentence excerpt/summary for the following content. Return ONLY the excerpt text with no explanation, no quotes.`;
		const raw = await callAI(systemPrompt, content.substring(0, 1000), ai);
		res.json({ success: true, text: raw.trim() });
	} catch (err) {
		console.error('[AIContent] excerpt error:', err);
		res.status(500).json({ success: false, error: err.message });
	}
};

exports.generateSeoTitle = async (req, res) => {
	try {
		const ai = await getAISettingsSafe();
		if (!ai?.enabled) return res.status(403).json({ success: false, error: 'AI is disabled' });

		const { title = '', content = '' } = req.body;
		const systemPrompt = `You are an SEO expert. Generate an SEO-optimized title (50-60 characters) for the following content. Return ONLY the title text with no explanation, no quotes.`;
		const userPrompt = `Current Title: ${title}\n\nContent: ${content.substring(0, 500)}`;
		const raw = await callAI(systemPrompt, userPrompt, ai);
		res.json({ success: true, text: raw.trim() });
	} catch (err) {
		console.error('[AIContent] seo-title error:', err);
		res.status(500).json({ success: false, error: err.message });
	}
};

exports.generateMetaDescription = async (req, res) => {
	try {
		const ai = await getAISettingsSafe();
		if (!ai?.enabled) return res.status(403).json({ success: false, error: 'AI is disabled' });

		const { content = '', title = '' } = req.body;
		if (!content) return res.status(400).json({ success: false, error: 'Content is required' });

		const systemPrompt = `You are an SEO expert. Write a compelling meta description (150-160 characters) for the following content. Return ONLY the description text with no explanation, no quotes.`;
		const userPrompt = `Title: ${title}\n\nContent: ${content.substring(0, 1000)}`;
		const raw = await callAI(systemPrompt, userPrompt, ai);
		res.json({ success: true, text: raw.trim() });
	} catch (err) {
		console.error('[AIContent] meta-description error:', err);
		res.status(500).json({ success: false, error: err.message });
	}
};

exports.suggestKeywords = async (req, res) => {
	try {
		const ai = await getAISettingsSafe();
		if (!ai?.enabled) return res.status(403).json({ success: false, error: 'AI is disabled' });

		const { content = '', title = '' } = req.body;
		const systemPrompt = `You are an SEO expert. Analyze the content and suggest a focus keyword and 5-10 related keywords. Return ONLY a JSON object with this exact shape: { "focusKeyword": "...", "keywords": ["...", "..."] }`;
		const userPrompt = `Title: ${title}\n\nContent: ${content.substring(0, 1000)}`;
		const raw = await callAI(systemPrompt, userPrompt, ai);
		try {
			const data = parseJSON(raw);
			res.json({ success: true, focusKeyword: data.focusKeyword || '', keywords: data.keywords || [] });
		} catch {
			res.json({ success: true, focusKeyword: '', keywords: [] });
		}
	} catch (err) {
		console.error('[AIContent] keywords error:', err);
		res.status(500).json({ success: false, error: err.message });
	}
};

exports.generateAltText = async (req, res) => {
	try {
		const ai = await getAISettingsSafe();
		if (!ai?.enabled) return res.status(403).json({ success: false, error: 'AI is disabled' });

		const { context = '', src = '' } = req.body;
		const systemPrompt = `You are an accessibility expert. Write a concise, descriptive alt text (max 125 characters) for an image. Return ONLY the alt text with no explanation, no quotes.`;
		const userPrompt = `Page context: ${context.substring(0, 300)}${src ? `\n\nImage filename: ${src}` : ''}`;
		const raw = await callAI(systemPrompt, userPrompt, ai);
		res.json({ success: true, text: raw.trim() });
	} catch (err) {
		console.error('[AIContent] alt-text error:', err);
		res.status(500).json({ success: false, error: err.message });
	}
};

exports.generateStructuredData = async (req, res) => {
	try {
		const ai = await getAISettingsSafe();
		if (!ai?.enabled) return res.status(403).json({ success: false, error: 'AI is disabled' });

		const { content = '', title = '', type = 'Article' } = req.body;
		const systemPrompt = `You are a structured data expert. Generate Schema.org JSON-LD structured data for the given content. Return ONLY valid JSON-LD with no explanation, no markdown.`;
		const userPrompt = `Type: ${type}\nTitle: ${title}\nContent: ${content.substring(0, 500)}`;
		const raw = await callAI(systemPrompt, userPrompt, ai);
		try {
			const data = parseJSON(raw);
			res.json({ success: true, data });
		} catch {
			res.json({ success: true, data: { '@context': 'https://schema.org', '@type': type, name: title } });
		}
	} catch (err) {
		console.error('[AIContent] schema error:', err);
		res.status(500).json({ success: false, error: err.message });
	}
};
