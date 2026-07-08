import React, {PureComponent} from "react";
import {getAvailableLanguages, getLanguage, setLanguage, subscribe} from "../../i18n";

export class Header extends PureComponent {
    state = {
        language: getLanguage()
    };

    componentDidMount() {
        this.unsubscribe = subscribe(() => this.setState({language: getLanguage()}));
    }

    componentWillUnmount() {
        if (this.unsubscribe) this.unsubscribe();
    }

    changeLanguage = (code) => {
        setLanguage(code);
    };

    render() {
        let current = this.state.language;
        return (
            <div className="language-switcher">
                {getAvailableLanguages().map(lang => (
                    <button
                        key={lang.code}
                        type="button"
                        className={"lang-button" + (current === lang.code ? " active" : "")}
                        onClick={() => this.changeLanguage(lang.code)}
                        title={lang.label}
                    >
                        {lang.label}
                    </button>
                ))}
            </div>
        );
    }
}
