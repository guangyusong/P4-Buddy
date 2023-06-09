import * as vscode from 'vscode';

import { Configuration, OpenAIApi } from 'openai';

function getActionCodeStartPosition(p4Code: string, actionName: string): number {
	const actionStartRegex = new RegExp(`action\\s+${actionName}\\s*\\((?:.|\\s)*?\\{`, 'm');
	const actionStartMatch = actionStartRegex.exec(p4Code);
	if (actionStartMatch) {
		return actionStartMatch.index;
	}
	return -1;
}

function getActionCode(p4Code: string, actionName: string): string {
	const actionStartRegex = new RegExp(`action\\s+${actionName}\\s*\\((?:.|\\s)*?\\{`, 'm');
	const actionStartMatch = actionStartRegex.exec(p4Code);
	if (actionStartMatch) {
		const actionStartPosition = actionStartMatch.index;
		let braceCount = 1;
		let actionEndPosition = actionStartPosition + actionStartMatch[0].length;

		while (braceCount > 0 && actionEndPosition < p4Code.length) {
			if (p4Code[actionEndPosition] === '{') {
				braceCount++;
			} else if (p4Code[actionEndPosition] === '}') {
				braceCount--;
			}
			actionEndPosition++;
		}

		if (braceCount === 0) {
			return p4Code.slice(actionStartPosition, actionEndPosition);
		}
	}

	return `Action code for '${actionName}' not found.`;
}

function formatCode(code: string): string {
	return '<pre><code>' + code + '</code></pre>';
}

export async function activate(context: vscode.ExtensionContext) {
	let panel: vscode.WebviewPanel | undefined;

	// Check if API key is already saved
	const apiKey = vscode.workspace.getConfiguration('openAI').get('apiKey');

	if (!apiKey) {
		// Prompt the user for the API key
		const inputApiKey = await vscode.window.showInputBox({
			prompt: 'Please enter your OpenAI API Key:',
			ignoreFocusOut: true,
		});

		// Save the API key
		if (inputApiKey) {
			await vscode.workspace.getConfiguration('openAI').update('apiKey', inputApiKey, vscode.ConfigurationTarget.Global);
		} else {
			vscode.window.showErrorMessage('OpenAI API key is required to use this extension.');
			return;
		}
	}

	const configuration = new Configuration({
		apiKey: apiKey as string,
	});
	const openai = new OpenAIApi(configuration);

	const callOpenAI = async (input: string) => {
		const pre = `This is an error from a P4 program. Please provide a technical answer in 100 words or less: `;

		try {
			const completion = await openai.createCompletion({
				model: "text-davinci-003",
				prompt: pre + input,
				max_tokens: 2048,
			});
			return completion.data.choices[0].text;
		} catch (error: any) {
			if (error.message.includes("API key")) {
				vscode.window.showErrorMessage(`Invalid OpenAI API key: ${error.message}`);
			} else {
				vscode.window.showErrorMessage(`Error calling OpenAI API: ${error.message}`);
			}
			return '';
		}
	};

	const updateSystemDescription = () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor found.');
			return;
		}

		const document = editor.document;
		if (document.languageId !== 'p4') {
			vscode.window.showErrorMessage('Active document is not a P4 file.');
			return;
		}

		const p4Code = document.getText();

		try {
			const description = generateDescriptionFromP4Code(p4Code);

			if (!panel) {
				panel = vscode.window.createWebviewPanel(
					'p4-buddy',
					'System Description',
					vscode.ViewColumn.Beside,
					{
						enableScripts: true, // Enable JavaScript in the WebView
					}
				);

				// Handle messages from the WebView
				panel.webview.onDidReceiveMessage(async (message) => {
					if (message.command === 'callOpenAI') {
						const input = message.text;
						const openAIResult = await callOpenAI(input);
						panel?.webview.postMessage({ command: 'displayOpenAIResult', text: openAIResult });
					}

					if (message.command === 'showCode') {
						const actionName = message.text;
						const actionCode = getActionCode(p4Code, actionName);
						const formattedActionCode = formatCode(actionCode);
						panel?.webview.postMessage({ command: 'displayActionCode', text: formattedActionCode });
					}
					if (message.command === 'goToTableCode') {
						const tableName = message.text;
						const tableRegex = new RegExp(`table\\s+${tableName}\\s*\\{`, 'm');
						const tableMatch = tableRegex.exec(p4Code);
						if (tableMatch) {
							const tableStartPosition = tableMatch.index;
							const tablePosition = document.positionAt(tableStartPosition);
							editor.selection = new vscode.Selection(tablePosition, tablePosition);
							editor.revealRange(editor.selection, vscode.TextEditorRevealType.InCenter);
						} else {
							vscode.window.showErrorMessage(`Table '${tableName}' not found.`);
						}
					}
					if (message.command === 'goToControlCode') {
						const controlName = message.text;
						const controlRegex = new RegExp(`control\\s+${controlName}\\s*\\(`, 'm');
						const controlMatch = controlRegex.exec(p4Code);
						if (controlMatch) {
							const controlStartPosition = controlMatch.index;
							const controlPosition = document.positionAt(controlStartPosition);
							editor.selection = new vscode.Selection(controlPosition, controlPosition);
							editor.revealRange(editor.selection, vscode.TextEditorRevealType.InCenter);
						} else {
							vscode.window.showErrorMessage(`Control '${controlName}' not found.`);
						}
					} else if (message.command === 'goToActionCode') {
						const actionName = message.text;
						const actionStartPosition = getActionCodeStartPosition(p4Code, actionName);
						if (actionStartPosition !== -1) {
							const actionPosition = document.positionAt(actionStartPosition);
							editor.selection = new vscode.Selection(actionPosition, actionPosition);
							editor.revealRange(editor.selection, vscode.TextEditorRevealType.InCenter);
						} else {
							vscode.window.showErrorMessage(`Action '${actionName}' not found.`);
						}
					}
				}, undefined, context.subscriptions);
			}

			const script = `
				const vscode = acquireVsCodeApi();
			
				function callOpenAI() {
					const userInput = document.getElementById('user-input').value;
					vscode.postMessage({
						command: 'callOpenAI',
						text: userInput,
					});
				}
			
				window.addEventListener('message', (event) => {
					const message = event.data;
					if (message.command === 'displayOpenAIResult') {
						const openAIResult = message.text;
						document.getElementById('display-output').innerHTML = openAIResult;
					}
			
					if (event.data.command === 'displayActionCode') {
						const actionCode = event.data.text;
						document.getElementById('action-code-display').innerHTML = actionCode;
					}
				});
			
				function showCode(actionName) {
					vscode.postMessage({
						command: 'showCode',
						text: actionName,
					});
				}

				function goToTableCode(tableName) {
					vscode.postMessage({
						command: 'goToTableCode',
						text: tableName,
					});
				}
				function goToControlCode(controlName) {
					vscode.postMessage({
						command: 'goToControlCode',
						text: controlName,
					});
				}
				
				function goToActionCode(actionName) {
					vscode.postMessage({
						command: 'goToActionCode',
						text: actionName,
					});
				}								
			`;

			panel.webview.html = `
            <!DOCTYPE html>
            <html lang="en">
              <head>
                <meta charset="UTF-8">
                <meta http-equiv="X-UA-Compatible" content="IE=edge">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>System Description</title>
                <style>
                  body {
                    font-family: sans-serif;
                  }
                  ul {
                    list-style: disc;
                    padding-left: 20px;
                  }
                  li {
                    white-space: pre-wrap;
                  }
                </style>
              </head>
			  <body>
			  <div>
				<textarea id="user-input" rows="3" cols="50" placeholder="Paste console error or a question here"></textarea>
				<br>
				<button onclick="callOpenAI()">Debug this!</button>
			  </div>
			  <p id="display-output"></p>
			  ${description}
			  <script>${script}</script>
			  <p id="action-code-display"></p>
			</body>			
            </html>
          `;

			vscode.window.showInformationMessage('System description updated successfully.');
		} catch (error: any) {
			vscode.window.showErrorMessage(`Error generating system description: ${error.message}`);
		}
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('p4-buddy.understandP4Code', () => {
			updateSystemDescription();
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument((document) => {
			if (document.languageId === 'p4') {
				updateSystemDescription();
			}
		})
	);
}

function generateDescriptionFromP4Code(p4Code: string): string {
	const controlRegex = /control\s+(\w+)\s*\(/;
	const tableRegex = /table\s+(\w+)\s*\{/;
	const actionFunctionRegex = /action\s+(\w+)\s*\(/g;

	let controls: { [key: string]: { tables: { [key: string]: { key: string[]; actions: string[]; size: string; default_action: string } } } } = {};

	let lines = p4Code.split('\n');
	let currentControl = '';
	let currentTable = '';
	let parsingKeys = false;
	let parsingActions = false;
	let actionFunctions: string[] = [];
	let actionFunctionMatch;
	while ((actionFunctionMatch = actionFunctionRegex.exec(p4Code)) !== null) {
		actionFunctions.push(actionFunctionMatch[1]);
	}
	for (const line of lines) {
		let controlMatch = controlRegex.exec(line);
		let tableMatch = tableRegex.exec(line);

		if (controlMatch) {
			currentControl = controlMatch[1];
			controls[currentControl] = { tables: {} };
		} else if (tableMatch && currentControl) {
			currentTable = tableMatch[1];
			controls[currentControl].tables[currentTable] = { key: [], actions: [], size: '', default_action: '' };
		} else if (currentControl && currentTable) {
			if (line.includes('key')) {
				parsingKeys = true;
			}
			if (line.includes('actions')) {
				parsingActions = true;
			}

			if (parsingKeys) {
				let keyMatch = line.match(/([\w.]+)\s*:\s*(\w+)\s*;/);
				if (keyMatch) {
					controls[currentControl].tables[currentTable].key.push(`${keyMatch[1]}: ${keyMatch[2]}`);
				}
				if (line.includes('}')) {
					parsingKeys = false;
				}
			} else if (parsingActions) {
				let actionMatch = line.match(/(\w+)\s*;/);
				if (actionMatch) {
					controls[currentControl].tables[currentTable].actions.push(actionMatch[1]);
				}
				if (line.includes('}')) {
					parsingActions = false;
				}
			}

			if (!parsingKeys && !parsingActions) {
				let sizeMatch = line.match(/size\s*=\s*(\d+)\s*;/);
				let defaultActionMatch = line.match(/default_action\s*=\s*(\w+)\s*;/);

				if (sizeMatch) {
					controls[currentControl].tables[currentTable].size = sizeMatch[1];
				}
				if (defaultActionMatch) {
					controls[currentControl].tables[currentTable].default_action = defaultActionMatch[1];
				}
			}
		}
	}

	let description = "<h1>System components:</h1>";
	for (const control in controls) {
		description += `<h3>Control: <a href="#" onclick="goToControlCode('${control}')">${control}</a></h3>`;
		if (Object.keys(controls[control].tables).length > 0) {
			description += "<h4>Tables:</h4>";
			for (const table in controls[control].tables) {
				description += `<h5><a href="#" onclick="goToTableCode('${table}')">${table}</a></h5>`;
				description += `<table border="1" cellspacing="0" cellpadding="4">`;
				description += `  <tr>`;
				description += `    <th>Property</th>`;
				description += `    <th>Value</th>`;
				description += `  </tr>`;
				description += `    <td>Key</td>`;
				description += `    <td>${controls[control].tables[table].key.join(', ')}</td>`;
				description += `  </tr>`;
				description += `  <tr>`;
				description += `    <td>Actions</td>`;
				description += `    <td>${controls[control].tables[table].actions.join(', ')}</td>`;
				description += `  </tr>`;
				description += `  <tr>`;
				description += `    <td>Size</td>`;
				description += `    <td>${controls[control].tables[table].size}</td>`;
				description += `  </tr>`;
				description += `  <tr>`;
				description += `    <td>Default Action</td>`;
				description += `    <td>${controls[control].tables[table].default_action}</td>`;
				description += `  </tr>`;
				description += `</table>`;
			}
		}
	}

	if (actionFunctions.length > 0) {
		description += "<h3>Actions:</h3>";
		description += "<ul>";
		for (const actionFunction of actionFunctions) {
			description += `<li><a href="#" onclick="goToActionCode('${actionFunction}')">${actionFunction}</a> &nbsp <button onclick="showCode('${actionFunction}')">Show Code</button>`;
		}
		description += "</ul>";
	}

	return description;
}	