import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('p4-plantuml-generator.understandP4Code', () => {
			generateSystemDescription();
		})
	);
}

function generateDescriptionFromP4Code(p4Code: string): string {
	const parserRegex = /parser\s+(\w+)\s*\(/g;
	const controlRegex = /control\s+(\w+)\s*\(/g;
	const structRegex = /struct\s+(\w+)\s*{/g;

	let parsers: string[] = [];
	let controls: string[] = [];
	let structs: string[] = [];

	let match;
	while ((match = parserRegex.exec(p4Code)) !== null) {
		parsers.push(match[1]);
	}
	while ((match = controlRegex.exec(p4Code)) !== null) {
		controls.push(match[1]);
	}
	while ((match = structRegex.exec(p4Code)) !== null) {
		structs.push(match[1]);
	}

	let description = "The system consists of the following components:\n";
	if (parsers.length > 0) {
		description += "• Parsers:\n";
		for (const parser of parsers) {
			description += `  ◦ ${parser}\n`;
		}
	}
	if (controls.length > 0) {
		description += "• Controls:\n";
		for (const control of controls) {
			description += `  ◦ ${control}\n`;
		}
	}
	if (structs.length > 0) {
		description += "• Structs:\n";
		for (const struct of structs) {
			description += `  ◦ ${struct}\n`;
		}
	}
	description += "\nThese components work together to process incoming and outgoing packets in a P4 network.";

	return description;
}

async function generateSystemDescription() {
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

		const panel = vscode.window.createWebviewPanel(
			'plantUMLPreview', // Identifies the type of the webview
			'System Description', // Title of the panel displayed to the user
			vscode.ViewColumn.Beside, // Editor column to show the new webview panel
			{} // Webview options
		);

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
			<ul>
			  <li>${description}</li>
			</ul>
		  </body>
		</html>
	  `;

		vscode.window.showInformationMessage('System description generated successfully.');
	} catch (error: any) {
		vscode.window.showErrorMessage(`Error generating system description: ${error.message}`);
	}
}	