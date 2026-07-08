import React, {Component} from "react";
import {ProgressComponent} from "../../../progress";
import {SettingsInput} from "./world_settings/settingsInput";
import mergeSettings from "./world_settings/settings";
import {t} from "../../../../i18n";

// Translatable category names shown as sub-tabs
const CATEGORY_KEYS = {
    "World Settings": "settings.worldSettings",
    "Game Rules": "settingsTab.gameRules",
    "Restrictions": "settingsTab.restrictions",
    "Weather": "settingsTab.weather",
    "Misc": "settingsTab.misc"
};

function getCategoryLabel(category) {
    let key = CATEGORY_KEYS[category];
    return key ? t(key, {}, category) : category;
}

export class WorldSettingsTab extends Component {
    app = this.props.app;

    updateSetting = (name, value) => {
        let clone = Object.assign({}, this.app.state.editedSettings);
        clone[name] = value;

        this.app.setState({editedSettings: clone});
    };

    setTab = (name, e) => {
        this.app.setState({worldSettingsTab: name});
        e.preventDefault();
    };

    render() {
        let categories = [];
        let settings = [];
        let java = this.app.state.outputType.id.startsWith("JAVA");
        if (this.app.settingsProgress.isComplete() && this.app.state.settings.settings !== undefined) {
            let allSettings = this.app.state.settings.settings;
            categories = Object.keys(allSettings);
            allSettings[this.app.state.worldSettingsTab].forEach((original) => {
                // Create clone to merge
                let item = Object.assign({}, original);
                if (original.order === undefined) {
                    item.order = Number.MAX_SAFE_INTEGER;
                }

                // Apply merging (descriptions etc)
                if (mergeSettings[this.app.state.worldSettingsTab] !== undefined && mergeSettings[this.app.state.worldSettingsTab][original.name] !== undefined) {
                    item = Object.assign(item, mergeSettings[this.app.state.worldSettingsTab][original.name]);

                    // Automatically calculate weight based on config position
                    if (original.order === undefined) {
                        item.order = Object.keys(mergeSettings[this.app.state.worldSettingsTab]).indexOf(original.name);
                    }
                }

                // Localize display / description / option names
                let category = this.app.state.worldSettingsTab;
                let settingKey = "worldSettings." + category + "." + item.name;
                let localizedDisplay = t(settingKey + ".display", {}, undefined);
                if (localizedDisplay !== undefined) item.display = localizedDisplay;
                let localizedDesc = t(settingKey + ".description", {}, undefined);
                if (localizedDesc !== undefined) item.description = localizedDesc;
                if (item.options) {
                    item.options = item.options.map(opt => {
                        let optLabel = t(settingKey + ".options." + opt.value, {}, undefined);
                        return optLabel !== undefined ? Object.assign({}, opt, {name: optLabel}) : opt;
                    });
                }

                // Add to tab
                if ((java && item.java) || (!java && item.bedrock)) {
                    settings.push(item);
                }

                let oldValue = item.value;
                // Update value from editedSettings
                if (this.app.state.editedSettings[item.name] !== undefined) {
                    item.value = this.app.state.editedSettings[item.name];
                }

                // Special case as GeneratorType varies on input/output
                if (item.name === "GeneratorType") {
                    item.type = "Radio";
                    let genKey = "worldSettings." + this.app.state.worldSettingsTab + ".GeneratorType.options.";

                    // If the world isn't being edited or it wasn't detected as custom
                    if (this.app.state.outputType.id !== this.app.state.inputType.id || oldValue !== "CUSTOM") {
                        if (item.value === "CUSTOM") {
                            item.value = "VOID";
                        }
                        item.options = [
                            {name: t(genKey + "NORMAL", {}, "NORMAL"), color: "blue", value: "NORMAL"},
                            {name: t(genKey + "FLAT", {}, "FLAT"), color: "green", value: "FLAT"},
                            {name: t(genKey + "VOID", {}, "VOID"), color: "red", value: "VOID"},
                        ];
                    } else {
                        item.options = [
                            {name: t(genKey + "NORMAL", {}, "NORMAL"), color: "blue", value: "NORMAL"},
                            {name: t(genKey + "FLAT", {}, "FLAT"), color: "green", value: "FLAT"},
                            {name: t(genKey + "CUSTOM", {}, "CUSTOM"), color: "yellow", value: "CUSTOM"},
                            {name: t(genKey + "VOID", {}, "VOID"), color: "red", value: "VOID"},
                        ];
                    }
                }
            });

            // Sort settings by order
            settings.sort((a, b) => a.order - b.order);
        }
        return (
            <React.Fragment>
                {(!this.app.settingsProgress.isComplete() &&
                    <div className="main_content">
                        <ProgressComponent progress={this.app.settingsProgress}/>
                    </div>
                )}
                {(this.app.settingsProgress.isComplete() &&
                    <React.Fragment>
                        <div className="topbar">
                            <h1>{t("worldSettingsTab.title")}</h1>
                            <h2>{t("worldSettingsTab.subtitle")}</h2>
                            <ul className="tabs">
                                {categories.map(category => (
                                    <li key={category}>
                                        <button className={this.app.state.worldSettingsTab === category ? "active" : ""}
                                                onClick={(e) => this.setTab(category, e)}>{getCategoryLabel(category)}</button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        {settings.length === 0 &&
                            <div className="main_content settings">
                                <h2>{t("worldSettingsTab.emptyCategory")}</h2>
                            </div>
                        }
                        {settings.length > 0 &&
                            <div className="main_content settings">
                                {settings.map((value, key) => (
                                    <SettingsInput key={this.app.state.worldSettingsTab + ":" + key} base={value}
                                                   name={value.display || value.name} onChange={this.updateSetting}/>
                                ))}
                            </div>
                        }
                    </React.Fragment>
                )}
            </React.Fragment>
        );
    }
}