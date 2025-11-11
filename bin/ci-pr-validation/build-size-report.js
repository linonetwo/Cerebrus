import PRCommentUtils from './pr-comment-utils.js';
import { CEREBRUS_IDENTIFIER, updateCommentSection, createCommentWithSection } from './comment-sections.js';

function humanize(bytes) {
	return `${(bytes / 1024).toFixed(1)} KB`;
}

function generateMarkdown({ prSize, baseSize, baseRef }) {
	const diff = prSize - baseSize;
	const absDiffKB = Math.abs(diff);
	const sign = diff >= 0 ? '+' : '';
	const direction = diff > 0 ? '⬆️ Increase' : diff < 0 ? '⬇️ Decrease' : '➖ No change';

	let badge = '';
	let alert = '';

	if(diff > 20 * 1024) {
		badge = '![🔴 Significant Increase](https://img.shields.io/badge/Size-Increase-red)';
		alert = '⚠️ **Warning:** Size increased significantly.';
	} else if(diff < -20 * 1024) {
		badge = '![🟢 Significant Decrease](https://img.shields.io/badge/Size-Decrease-brightgreen)';
		alert = '✅ **Great job!** Size decreased significantly.';
	}

	return `### 📊 Build Size Comparison: \`empty.html\`

| Branch | Size |
|--------|------|
| Base (${baseRef}) | ${humanize(baseSize)} |
| PR    | ${humanize(prSize)} |

**Diff:** **${direction}: \`${sign}${humanize(absDiffKB)}\`**

${badge}

${alert}
`;
}



async function commentSize(context, octokit, dryRun) {
    if(process.env.GITHUB_ACTIONS === 'true') {
        const core = await import('@actions/core');
		const prSizeInput = core.getInput("pr_size");
		const baseSizeInput = core.getInput("base_size");
        const prSize = Number(prSizeInput);
        const baseSize = Number(baseSizeInput);
    
        if(isNaN(prSize) || prSize < 0) {
            throw new Error(`Invalid pr_size input: ${prSizeInput}`);
        }
        if(isNaN(baseSize) || baseSize <= 0) {
            throw new Error(`Invalid base_size input: ${baseSizeInput}`);
        }
        const baseRef = context.baseRef.replace(/[^\w./-:]/g, '');
        if(!baseRef) {
            throw new Error(`Invalid base_ref input: ${baseRefInput}`);
        }
        context.prSize = prSize;
        context.baseSize = baseSize;
        context.baseRef = baseRef;
    }

    console.log(`ℹ️  received payload: PR size: ${context.prSize}, base size: ${context.baseSize}`);

    const {
        prNumber,
        repo,
        owner,
        repoName
    } = context;

    const message = generateMarkdown(context);
    
    const utils = new PRCommentUtils(octokit);
    if(dryRun) {
        console.log(`💬 [dry-run] Would post comment:\n${message}`);
    } else {
        // Check if there's an existing Cerebrus comment
        const existingComment = await utils.getExistingComment(owner, repoName, prNumber, CEREBRUS_IDENTIFIER);
        
        if (existingComment) {
            // Update existing comment, replacing the build size section
            const updatedBody = updateCommentSection(existingComment.body, 'BUILD_SIZE', message);
            await utils.updateComment(owner, repoName, prNumber, existingComment.id, updatedBody);
        } else {
            // Create new comment with Cerebrus identifier
            const fullComment = createCommentWithSection('BUILD_SIZE', message);
            await utils.postComment(owner, repoName, prNumber, fullComment);
        }
    }
}

export default commentSize;