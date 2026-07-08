import React, {Component} from "react";
import {BlockMapping} from "./blocks/blockMapping";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faTimes} from "@fortawesome/free-solid-svg-icons";
import {getLocalizedFormatName, getVersionName} from "../../mode/modeOption";
import {t} from "../../../../i18n";


export class PaletteMappingsTab extends Component {
    app = this.props.app;
    state = {
        presets: []
    };

    componentDidMount() {
        fetch("static://presets/block_mappings/index.json")
            .then(res => res.ok ? res.json() : [])
            .then(presets => this.setState({presets: presets}))
            .catch(e => console.info("Failed to load block mapping presets", e));
    }

    delete = (id) => {
        let clone = JSON.parse(JSON.stringify(this.app.state.mappings));
        clone.identifiers = clone.identifiers.slice(0, id).concat(clone.identifiers.slice(id + 1, clone.identifiers.length));
        this.app.setState({mappings: clone});
    };

    update = (id, newState) => {
        let clone = JSON.parse(JSON.stringify(this.app.state.mappings));
        clone.identifiers[id] = newState;
        this.app.setState({mappings: clone});
    };

    toJSON = () => {
        return JSON.stringify({
            "value": {
                "mappings": this.app.state.mappings,
            }, "type": "mappings"
        });
    };

    fromJSON = (json) => {
        try {
            let parsed = JSON.parse(json);
            if (parsed.type !== undefined && parsed.type === "mappings") {
                if (Array.isArray(parsed.value.mappings)) {
                    this.app.setState({mappings: parsed.value.mappings});
                }
            }
        } catch (e) {
            // Ignored, file invalid
            console.info("File failed to be read", e, json);
        }
    };

    usePreset = (preset) => {
        fetch("static://presets/block_mappings/" + preset.file)
            .then(res => res.json())
            .then(mappings => this.app.setState({mappings: mappings}))
            .catch(e => console.info("Failed to load block mapping preset", e));
    };

    render() {
        let inputVersion = getVersionName(this.app.state.inputType.id);
        let inputFormat = getLocalizedFormatName(this.app.state.inputType.id);
        let inputJava = this.app.state.inputType.id.startsWith("JAVA_");
        let outputVersion = getVersionName(this.app.state.outputType.id);
        let outputFormat = getLocalizedFormatName(this.app.state.outputType.id);
        let outputJava = this.app.state.outputType.id.startsWith("JAVA_");
        let presets = this.state.presets.filter(preset => preset.input === this.app.state.inputType.id && preset.output === this.app.state.outputType.id);
        return (
            <div>
                <div className="topbar">
                    <h1>{t("blocks.title")}</h1>
                    <h2><b>{t("blocks.subtitleBefore")}</b>{t("blocks.subtitleAfter")}
                    </h2>
                    {presets.length > 0 &&
                        <div className="preset-actions">
                            {presets.map(preset => (
                                <button className="button blue" key={preset.file} onClick={() => this.usePreset(preset)}>
                                    {t("blocks.usePreset", {name: preset.name})}
                                </button>
                            ))}
                        </div>}
                </div>
                <div className="main_content settings dimensions">
                    {(this.app.state.inputBlockSuggestions.length === 0 || this.app.state.outputBlockSuggestions.length === 0) &&
                        <p>
                            <div
                                align="center">{t("blocks.unavailable")}
                            </div>
                        </p>}
                    {this.app.state.inputBlockSuggestions.length > 0 && this.app.state.outputBlockSuggestions.length > 0 &&
                        <div>
                            <div className="mappings-row">
                                <div className="mappings-entry" align="center">
                                    <span>{t("blocks.inputBlock", {format: inputFormat, version: inputVersion})}</span>
                                </div>
                                <div className="mappings-entry" align="center">
                                    <span>{t("blocks.outputBlock", {format: outputFormat, version: outputVersion})}</span>
                                </div>
                                <div className="mappings-delete">
                                    <button className="icon-button" style={{visibility: "hidden"}}>
                                        <FontAwesomeIcon icon={faTimes}/>
                                    </button>
                                </div>
                            </div>
                            {this.app.state.mappings.identifiers.concat([{
                                "old_identifier": "",
                                "new_identifier": "",
                                "old_state_values": [],
                                "new_state_values": []
                            }]).map((a, k) => (
                                <BlockMapping
                                    value={a}
                                    key={k}
                                    inputJava={inputJava}
                                    inputBlockSuggestions={this.app.state.inputBlockSuggestions}
                                    outputJava={outputJava}
                                    outputBlockSuggestions={this.app.state.outputBlockSuggestions}
                                    onChange={(newState) => this.update(k, newState)}
                                    canDelete={k < this.app.state.mappings.identifiers.length}
                                    onDelete={() => this.delete(k)}
                                />
                            ))}
                        </div>}
                </div>
            </div>
        );
    }
}
