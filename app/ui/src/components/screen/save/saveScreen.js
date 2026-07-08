import React from "react";
import {BaseScreen} from "../baseScreen";
import api from "../../../api";
import {Round2DP} from "../../progress";
import {getLocalizedFormatName, getVersionName} from "../mode/modeOption";
import {t} from "../../../i18n";

export class SaveScreen extends BaseScreen {
    state = {
        modalShown: false,
        saving: false,
        saved: false,
        percentage: 0
    };

    getStage = () => {
        return 4;
    };

    onClick = (e) => {
        let self = this;
        e.preventDefault();

        // Call the save
        api.send({type: "flow", method: "save", url: this.app.state.convertResult.download}, (message) => {
            if (message.type === "error") {
                self.setState({
                    saving: false,
                    saved: false
                })
                self.app.showError(t("errors.failedSaveTitle"), message.error, message.errorId, message.stackTrace, true);
            } else if (message.type === "response") {
                self.setState({
                    saving: false,
                    saved: true
                })
            } else if (message.type === "progress") {
                self.setState({
                    saving: true,
                    saved: false,
                    percentage: message.percentage * 100
                })
            }
        });
    };

    openModal = () => this.setState({modalShown: true});

    closeModal = () => this.setState({modalShown: false});

    render() {
        // Version info
        let version = getVersionName(this.app.state.outputType.id);
        let format = getLocalizedFormatName(this.app.state.outputType.id);

        // Error IDs
        let errorIds = this.app.state.convertResult.anonymousId !== "" ? this.app.state.convertResult.anonymousId : undefined;

        // Convert to nice identifiers
        let missingIdentifiers = t("save.missingIdentifiersPrefix") + this.app.state.convertResult.missingIdentifiers.map(a => {
            return a.identifier + (a.states ? "[" + a.states.states.map(s => s.item1 + "=" + s.item2.value).join(",") + "]" : "")
        }).join("\n");

        return (
            <div className="maincol">
                <div className="topbar">
                    <h1>{t("save.title")}</h1>
                    <h2>{t("save.subtitle", {format: format, version: version})}</h2>
                </div>
                <div className="main_content main_content_progress">
                    {!this.state.saved && !this.state.saving && <h3>{t("save.ready")}</h3>}
                    {this.state.saving && <React.Fragment>
                        <h3>{t("save.saving", {percent: Round2DP(this.state.percentage) + "%"})}</h3>
                        <div className="progress_bar">
                            <div className="progress_fill" style={{width: this.state.percentage + "%"}}/>
                        </div>
                    </React.Fragment>}
                    {this.state.saved && <h3>{t("save.saved")}</h3>}
                    {this.state.saved && <p>{t("save.savedMsg")}</p>}
                    {!this.state.saved && <p>{t("save.notSavedMsg")}</p>}
                    {errorIds && (
                        <div>
                            <h1>{t("save.errorsTitle")}</h1>
                            <p>{t("save.errorsMsg").split("{ids}")[0]}<span
                                    className="world_name">{errorIds}</span>{t("save.errorsMsg").split("{ids}")[1]}
                            </p>
                        </div>
                    )}
                    {this.app.state.convertResult.missingIdentifiers.length > 0 &&
                        <div>
                            <button className="button blue" onClick={this.openModal}>{t("save.showOutputLog")}</button>
                        </div>
                    }
                </div>
                {this.state.modalShown && <div className="modal_overlay">
                    <div className="modal">
                        <h3>{t("save.outputLogTitle")}</h3>
                        <textarea className="output-log" readOnly={true} value={missingIdentifiers}/>
                        <br/>
                        <p>
                            <button className="button green" onClick={this.closeModal}>{t("common.close")}</button>
                        </p>
                    </div>
                </div>}
                <div className="bottombar">
                    <button onClick={() => window.location.reload()} type="submit" className="button red">{t("common.restart")}
                    </button>
                    <a download rel="noopener noreferrer" href={this.app.state.convertResult.download}
                       onClick={this.onClick} className="button green">{t("common.save")}</a>
                </div>
            </div>
        );
    }
}