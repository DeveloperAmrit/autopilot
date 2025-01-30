import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import fetch from 'node-fetch';

// Interface for AI response structure
interface ProjectAnalysis {
    projectName: string;
    techStack: string[];
    projectIdeas: string[];
    folderStructureAnalysis: string;
    summary: string;
}

export function activate(context: vscode.ExtensionContext) {
    // Register command to analyze project
    let disposable = vscode.commands.registerCommand('autopilot.analyzeProject', async () => {
        try {
            // Get workspace folder
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found!');
                return;
            }

            // Show progress
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Analyzing project...",
                cancellable: false
            }, async (progress) => {
                // Step 1: Read directory structure
                progress.report({ message: "Scanning project structure..." });
                const structure = await getDirectoryStructure(workspaceFolder.uri.fsPath);

                // Step 2: Collect important files
                progress.report({ message: "Identifying key files..." });
                const keyFiles = await identifyKeyFiles(workspaceFolder.uri.fsPath);

                // Step 3: Call DeepSeek AI API
                progress.report({ message: "Consulting DeepSeek AI..." });
                const analysis = await analyzeWithDeepSeek(structure, keyFiles);

                // Step 4: Show results
                showAnalysisResults(analysis);
            });

        } catch (error) {
            vscode.window.showErrorMessage(`Analysis failed: ${error instanceof Error ? error.message : error}`);
        }
    });

    context.subscriptions.push(disposable);
}

// Get directory structure recursively
async function getDirectoryStructure(rootPath: string): Promise<string> {
    async function walk(dir: string): Promise<string> {
        let structure = '';
        const files = await fs.promises.readdir(dir);
        
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stats = await fs.promises.stat(filePath);
            
            if (stats.isDirectory()) {
                structure += `${file}/\n`;
                structure += await walk(filePath);
            } else {
                structure += `${file}\n`;
            }
        }
        return structure;
    }

    return walk(rootPath);
}

// Identify and read key files
async function identifyKeyFiles(rootPath: string): Promise<{ [key: string]: string }> {
    const keyFiles: { [key: string]: string } = {};
    const importantFiles = [
        'package.json', 'requirements.txt', 'pom.xml', 'build.gradle',
        'Dockerfile', 'README.md', 'docker-compose.yml', '.gitignore',
        'tsconfig.json', 'webpack.config.js'
    ];

    for (const file of importantFiles) {
        const filePath = path.join(rootPath, file);
        if (fs.existsSync(filePath)) {
            keyFiles[file] = fs.readFileSync(filePath, 'utf-8');
        }
    }

    return keyFiles;
}

// Analyze with DeepSeek AI
async function analyzeWithDeepSeek(structure: string, files: { [key: string]: string }): Promise<ProjectAnalysis> {
    const config = vscode.workspace.getConfiguration('autopilot');
    const apiKey = ''                                                      // TO DO: donot expose your api key

    if (!apiKey) {
        throw new Error('DeepSeek API key not configured. Check extension settings.');
    }

    const prompt = `Analyze this project structure and files. Provide:
1. Project name (from directory structure)
2. Tech stack (programming languages, frameworks, tools)
3. Project purpose/ideas (based on files and structure)
4. Folder structure analysis
5. Brief summary

Project structure:
${structure}

Key files content:
${JSON.stringify(files, null, 2)}`;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "deepseek-chat",
            messages: [{
                role: "user",
                content: prompt
            }],
            temperature: 0.7
        })
    });

    if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
    }

    const data: any = await response.json();
    const rawAnalysis = data.choices[0].message.content;

    // Parse the AI response into structured format
    return parseAiResponse(rawAnalysis);
}

// Parse AI response into structured format
function parseAiResponse(rawText: string): ProjectAnalysis {
    // This parsing can be improved based on actual AI response patterns
    const result: ProjectAnalysis = {
        projectName: '',
        techStack: [],
        projectIdeas: [],
        folderStructureAnalysis: '',
        summary: ''
    };

    const sections = rawText.split('\n\n');
    sections.forEach(section => {
        const lines = section.split('\n');
        const header = lines[0].toLowerCase();
        
        if (header.includes('project name')) {
            result.projectName = lines.slice(1).join(' ').trim();
        } else if (header.includes('tech stack')) {
            result.techStack = lines.slice(1).map(line => line.replace(/^- /, '').trim());
        } else if (header.includes('project purpose') || header.includes('project ideas')) {
            result.projectIdeas = lines.slice(1).map(line => line.replace(/^- /, '').trim());
        } else if (header.includes('folder structure')) {
            result.folderStructureAnalysis = lines.slice(1).join('\n');
        } else if (header.includes('summary')) {
            result.summary = lines.slice(1).join('\n');
        }
    });

    return result;
}

// Display results in webview
function showAnalysisResults(analysis: ProjectAnalysis) {
    const panel = vscode.window.createWebviewPanel(
        'projectAnalysis',
        'Project Analysis',
        vscode.ViewColumn.One,
        {}
    );

    panel.webview.html = `<!DOCTYPE html>
    <html>
    <head>
        <style>
            body { padding: 20px; font-family: Arial, sans-serif; }
            h1 { color: #1a73e8; }
            .section { margin-bottom: 25px; }
            .badge { background: #e8f0fe; color: #1967d2; padding: 2px 8px; border-radius: 4px; margin: 2px; }
        </style>
    </head>
    <body>
        <h1>${analysis.projectName}</h1>
        
        <div class="section">
            <h3>📚 Tech Stack</h3>
            ${analysis.techStack.map(t => `<span class="badge">${t}</span>`).join(' ')}
        </div>

        <div class="section">
            <h3>💡 Project Ideas</h3>
            <ul>${analysis.projectIdeas.map(i => `<li>${i}</li>`).join('')}</ul>
        </div>

        <div class="section">
            <h3>📁 Structure Analysis</h3>
            <pre>${analysis.folderStructureAnalysis}</pre>
        </div>

        <div class="section">
            <h3>📝 Summary</h3>
            <p>${analysis.summary}</p>
        </div>
    </body>
    </html>`;
}