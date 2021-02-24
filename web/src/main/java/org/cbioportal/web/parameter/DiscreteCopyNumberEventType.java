package org.cbioportal.web.parameter;

import java.util.Arrays;
import java.util.List;

public enum DiscreteCopyNumberEventType {

    DEEPDEL_AND_AMP(-2, 2),
    DEEPDEL(-2),
    AMP(2),
    GAIN(1),
    SHALLOWDEL(-1),
    DIPLOID(0),
    ALL(-2, -1, 0, 1, 2);

    private List<Integer> alterationTypes;

    DiscreteCopyNumberEventType(Integer... alterationTypes) {
        this.alterationTypes = Arrays.asList(alterationTypes);
    }

    public List<Integer> getAlterationTypes() {
        return alterationTypes;
    }
}
