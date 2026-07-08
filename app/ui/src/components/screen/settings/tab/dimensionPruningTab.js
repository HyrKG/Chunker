import React, {Component} from "react";
import {ProgressComponent} from "../../../progress";
import {SettingsInput} from "./world_settings/settingsInput";
import {t} from "../../../../i18n";

export function getDimensionDisplayName(identifier) {
    switch (identifier) {
        case "minecraft:overworld": return t("dimension.overworld");
        case "minecraft:the_nether": return t("dimension.theNether");
        case "minecraft:the_end": return t("dimension.theEnd");
        default: {
            const parts = identifier.split(":");
            return parts.map(p => p.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())).join(": ");
        }
    }
}

function getDimensionColor(identifier) {
    switch (identifier) {
        case "minecraft:overworld": return "green";
        case "minecraft:the_nether": return "red";
        case "minecraft:the_end": return "yellow";
        default: return "blue";
    }
}

export class DimensionPruningTab extends Component {
    app = this.props.app;

    onChange = (input, output) => {
        this.app.setState((prevState) => {
            let dimensionMapping2 = Object.assign({}, prevState.dimensionMapping);

            if (output === "NONE") {
                delete dimensionMapping2[input];
            } else {
                dimensionMapping2[input] = output;
            }

            return {dimensionMapping: dimensionMapping2};
        });
    };

    validateSetting = (tab, setting) => {
        if (setting.type !== "Int32") return; // Don't validate any other settings

        // Ensure we don't have NaN set as a value
        if (this.app.state.pruningSettings[tab]) {
            if (isNaN(this.app.state.pruningSettings[tab].regions[setting.region][setting.name])) {
                // Reset NaN -> 0
                this.app.setState((prevState) => {
                    let pruningSettingsClone = JSON.parse(JSON.stringify(prevState.pruningSettings));
                    pruningSettingsClone[tab].regions[setting.region][setting.name] = 0;

                    return {pruningSettings: pruningSettingsClone};
                }, () => this.validateSetting(tab, setting)); // Validate when done to ensure no reordering is needed
            } else {
                // Ensure that min & max is the right way around
                let minName = setting.name.replace("max", "min");
                let maxName = setting.name.replace("min", "max");

                // Get current values
                let min = this.app.state.pruningSettings[tab].regions[setting.region][minName];
                let max = this.app.state.pruningSettings[tab].regions[setting.region][maxName];

                // If min > max, then we should swap them
                if (min !== max && min > max) {
                    this.app.setState((prevState) => {
                        let pruningSettingsClone = JSON.parse(JSON.stringify(prevState.pruningSettings));

                        // Set the new min
                        pruningSettingsClone[tab].regions[setting.region][minName] = max;

                        // Set the new max
                        pruningSettingsClone[tab].regions[setting.region][maxName] = min;

                        return {pruningSettings: pruningSettingsClone};
                    });
                }
            }
        }
    }

    updateSetting = (tab, name, value, setting) => {
        if (name === "Dimension") {
            this.app.setState((prevState) => {
                let dimensionMappingClone = Object.assign({}, prevState.dimensionMapping);

                if (value === "NONE") {
                    delete dimensionMappingClone[tab];
                } else {
                    dimensionMappingClone[tab] = value;
                }

                return {dimensionMapping: dimensionMappingClone};
            });
        } else if (name === "Pruning") {
            this.app.setState((prevState) => {
                let pruningSettingsClone = JSON.parse(JSON.stringify(prevState.pruningSettings));

                if (value !== "OFF") {
                    pruningSettingsClone[tab] = {
                        regions: [{
                            minChunkX: -10,
                            minChunkZ: -10,
                            maxChunkX: 10,
                            maxChunkZ: 10
                        }],
                        ...pruningSettingsClone[tab],
                        include: value === "INCLUDE"
                    };
                } else {
                    pruningSettingsClone[tab] = null;
                }

                return {pruningSettings: pruningSettingsClone};
            });
        } else if (name === "addRegion") {
            this.app.setState((prevState) => {
                let pruningSettingsClone = JSON.parse(JSON.stringify(prevState.pruningSettings));
                pruningSettingsClone[tab].regions = pruningSettingsClone[tab].regions.concat([{
                    minChunkX: -10,
                    minChunkZ: -10,
                    maxChunkX: 10,
                    maxChunkZ: 10
                }]);

                return {pruningSettings: pruningSettingsClone};
            });
        } else if (name === "removeRegion") {
            this.app.setState((prevState) => {
                let pruningSettingsClone = JSON.parse(JSON.stringify(prevState.pruningSettings));
                pruningSettingsClone[tab].regions.splice(setting.region, 1);

                return {pruningSettings: pruningSettingsClone};
            });
        } else {
            this.app.setState((prevState) => {
                let pruningSettingsClone = JSON.parse(JSON.stringify(prevState.pruningSettings));

                // Update settings
                if (name === "name") {
                    // Check if name is equal to the default
                    if (value !== t("dimension.regionN", {n: setting.region + 1})) {
                        pruningSettingsClone[tab].regions[setting.region][name] = value;
                    } else {
                        // Delete the name
                        delete pruningSettingsClone[tab].regions[setting.region][name];
                    }
                } else {
                    // Parse as int
                    pruningSettingsClone[tab].regions[setting.region][name] = parseInt(value);
                }


                // Return the new state
                return {pruningSettings: pruningSettingsClone};
            });
        }
    };

    setTab = (name, e) => {
        e.preventDefault();
        this.app.setState({dimensionSettingsTab: name});
    };

    toDimensionOption = (input, output) => {
        let dimensions = this.app.state.settings?.dimensions ?? [];
        return {
            // "name" is an internal control-flow identifier consumed by
            // updateSetting (name === "Dimension"); it must NOT be localized.
            // The visible label is passed via the `name` prop in render().
            "name": "Dimension",
            "description": t("dimension.dimensionOption.description", {name: getDimensionDisplayName(input)}),
            "type": "Radio",
            "value": output || "NONE",
            "options": [
                {
                    "name": t("dimension.dimensionOption.none"),
                    "color": "blue",
                    "value": "NONE"
                },
                ...dimensions.map(dim => ({
                    "name": getDimensionDisplayName(dim),
                    "color": getDimensionColor(dim),
                    "value": dim
                }))
            ]
        };
    };

    getOptions = (dimension) => {
        let enabled = !!(this.app.state.pruningSettings[dimension]
            && this.app.state.pruningSettings[dimension].regions
            && this.app.state.pruningSettings[dimension].regions.length > 0);
        let pruningSetting = enabled ? (this.app.state.pruningSettings[dimension].include ? "INCLUDE" : "EXCLUDE") : "OFF";
        let options = [
            {
                "name": "Pruning",
                "display": t("dimension.chunkPruning.display"),
                "description": t("dimension.chunkPruning.description"),
                "type": "Radio",
                "value": pruningSetting,
                "options": [
                    {
                        "name": t("dimension.chunkPruning.off"),
                        "color": "blue",
                        "value": "OFF"
                    },
                    {
                        "name": t("dimension.chunkPruning.include"),
                        "color": "green",
                        "value": "INCLUDE"
                    },
                    {
                        "name": t("dimension.chunkPruning.exclude"),
                        "color": "red",
                        "value": "EXCLUDE"
                    }
                ]
            }
        ];

        if (this.app.state.pruningSettings[dimension] && this.app.state.pruningSettings[dimension].regions) {
            this.app.state.pruningSettings[dimension].regions.forEach((region, index) => {
                options = options.concat([{
                    "display": t("dimension.removeRegion.display", {n: index + 1}),
                    "name": "removeRegion",
                    "description": t("dimension.removeRegion.description"),
                    "header": true,
                    "type": "Button",
                    "value": "X",
                    "region": index
                }]);
                // Add settings for dimension pruning
                options = options.concat([
                    {
                        "display": t("dimension.regionName.display"),
                        "name": "name",
                        "description": t("dimension.regionName.description"),
                        "type": "String",
                        "value": region.name ?? t("dimension.regionN", {n: index + 1}),
                        "region": index
                    },
                    {
                        "display": t("dimension.startChunkX.display"),
                        "name": "minChunkX",
                        "description": t("dimension.startChunkX.description"),
                        "type": "Int32",
                        "value": region.minChunkX,
                        "region": index
                    },
                    {
                        "display": t("dimension.startChunkZ.display"),
                        "name": "minChunkZ",
                        "description": t("dimension.startChunkZ.description"),
                        "type": "Int32",
                        "value": region.minChunkZ,
                        "region": index
                    },
                    {
                        "display": t("dimension.endChunkX.display"),
                        "name": "maxChunkX",
                        "description": t("dimension.endChunkX.description"),
                        "type": "Int32",
                        "value": region.maxChunkX,
                        "region": index
                    },
                    {
                        "display": t("dimension.endChunkZ.display"),
                        "name": "maxChunkZ",
                        "description": t("dimension.endChunkZ.description"),
                        "type": "Int32",
                        "value": region.maxChunkZ,
                        "region": index
                    }
                ]);
            });

            // Only show add region if it's enabled
            if (enabled) {
                options = options.concat([
                    {
                        "display": t("dimension.addRegion.display"),
                        "borderless": true,
                        "name": "addRegion",
                        "description": t("dimension.addRegion.description"),
                        "value": t("dimension.addRegion.display"),
                        "type": "Button"
                    }
                ]);
            }
        }
        return options;
    };

    render() {
        let tab = this.app.state.dimensionSettingsTab;
        if (this.app.state.dimensionSettingsTab === undefined && this.app.settingsProgress.isComplete()) {
            tab = this.app.state.settings.dimensions[0];
        }

        let pruningSettings = this.getOptions(tab);
        return (
            <div>
                {(this.app.settingsProgress.isComplete() &&
                    <React.Fragment>
                        <div className="topbar">
                            <h1>{t("dimension.title")}</h1>
                            <h2>{t("dimension.subtitle")}</h2>
                            <ul className="tabs">
                                {this.app.state.settings.dimensions.map(name => (
                                    <li key={name}>
                                        <button className={tab === name ? "active" : ""}
                                                onClick={(e) => this.setTab(name, e)}>{getDimensionDisplayName(name)}</button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="main_content settings dimensions" id={tab}>
                            <SettingsInput base={this.toDimensionOption(tab, this.app.state.dimensionMapping[tab])}
                                           name={t("dimension.outputDimension")}
                                           onChange={(name, value) => this.updateSetting(tab, name, value)}/>
                            {pruningSettings.map(setting => (
                                <SettingsInput key={setting.name + ":" + setting.region} base={setting}
                                               name={setting.display}
                                               onChange={(name, value) => this.updateSetting(tab, name, value, setting)}
                                               onBlur={() => this.validateSetting(tab, setting)}/>
                            ))}
                        </div>
                    </React.Fragment>
                )}
                {(!this.app.settingsProgress.isComplete() &&
                    <div className="center-table">
                        <div className="center-cell">
                            <div>
                                <ProgressComponent progress={this.app.settingsProgress}/>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }
}
